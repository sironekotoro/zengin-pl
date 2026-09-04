use strict;
use warnings;
use utf8;
use Test::More;
use Encode qw(encode_utf8);

use Zengin::Pl;

binmode Test::More->builder->output,         ':encoding(UTF-8)';
binmode Test::More->builder->failure_output, ':encoding(UTF-8)';

{
    package Local::MockHTTP;

    sub new {
        my ( $class, %responses ) = @_;
        return bless { responses => \%responses }, $class;
    }

    sub get {
        my ( $self, $url ) = @_;
        my $response = $self->{responses}{$url};
        die "No mock response for $url" unless $response;
        return $response;
    }
}

sub success {
    my ($content) = @_;
    return {
        success => 1,
        status  => 200,
        reason  => 'OK',
        content => encode_utf8($content),
    };
}

my $base      = 'https://example.test/data';
my $banks_url = "$base/banks.json";

# 三菱UFJ(0005)は全角大文字の英字を含む名称、東京(0010)は業態接尾辞を持たない名称。
my $banks_json = <<'JSON';
{
    "0005": { "code": "0005", "name": "三菱ＵＦＪ", "kana": "ミツビシユ－エフジエイ", "hira": "みつびしゆーえふじえい" },
    "0010": { "code": "0010", "name": "東京", "kana": "トウキヨウ", "hira": "とうきよう" }
}
JSON

my $branches_url  = "$base/branches/0010.json";
my $branches_json = <<'JSON';
{
    "001": { "code": "001", "name": "本店", "kana": "ホンテン", "hira": "ほんてん" }
}
JSON

sub client {
    my $http = Local::MockHTTP->new(
        $banks_url    => success($banks_json),
        $branches_url => success($branches_json),
    );
    return Zengin::Pl->new( base_url => $base, http_client => $http );
}

subtest 'zenkaku alphabet in data matches hankaku/case-varied queries' => sub {
    for my $query (qw(UFJ ufj ＵＦＪ ｕｆｊ)) {
        my $res = client()->search($query);
        is( scalar @{$res}, 1, "「$query」で1件ヒットする" )
            or diag explain $res;
        is( $res->[0]{code}, '0005', "「$query」は0005にヒットする" ) if @{$res};
    }
};

subtest 'hankaku kana query matches zenkaku kana/hiragana data' => sub {
    my $res = client()->search('ﾄｳｷﾖｳ');
    is( scalar @{$res}, 1, '半角カナ「ﾄｳｷﾖｳ」で1件ヒットする' );
    is( $res->[0]{code}, '0010', '半角カナ検索は0010にヒットする' ) if @{$res};
};

subtest 'zenkaku digit code query matches hankaku digit code data' => sub {
    my $res = client()->search('００１０');
    is( scalar @{$res}, 1, '全角数字コード「００１０」で1件ヒットする' );
    is( $res->[0]{code}, '0010', '全角数字コード検索は0010にヒットする' ) if @{$res};
};

subtest 'branch search normalizes both bank and branch patterns' => sub {
    my $res = client()->search( 'とうきよう', 'ほんてん' );
    is( scalar @{$res}, 1, 'ひらがな2引数検索で1件ヒットする' );
    is( $res->[0]{code}, '001', '支店コード001にヒットする' ) if @{$res};
};

subtest 'regexp patterns bypass normalization for backward compatibility' => sub {
    my $res = client()->search(qr/^三菱/);
    is( scalar @{$res}, 1, '正規表現パターンは従来通り前方一致で動く' );
    is( $res->[0]{code}, '0005', '正規表現検索は0005にヒットする' ) if @{$res};
};

done_testing;
