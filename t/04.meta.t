use strict;
use warnings;
use utf8;
use open qw(:std :encoding(UTF-8));
use Test::More;

use Zengin::Pl;
use Zengin::Client;

binmode Test::More->builder->output,         ':encoding(UTF-8)';
binmode Test::More->builder->failure_output, ':encoding(UTF-8)';
binmode Test::More->builder->todo_output,    ':encoding(UTF-8)';

{
    package Local::MetaHTTP;

    sub new {
        my ( $class, %responses ) = @_;
        return bless { calls => {}, responses => \%responses }, $class;
    }

    sub get {
        my ( $self, $url ) = @_;
        $self->{calls}{$url}++;
        my $responses = $self->{responses}{$url} || [];
        die "No mock response for $url" unless @{$responses};
        return @{$responses} > 1 ? shift @{$responses} : $responses->[0];
    }

    sub calls {
        my ( $self, $url ) = @_;
        return $self->{calls}{$url} || 0;
    }
}

my $base         = 'https://example.test/data';
my $updated_url  = "$base/updated_at";
my $revision_url = "$base/revision";
my $sha1         = '647513f71c69505e09deb7a1da1717ec22dabedc';
my $sha2         = 'A' x 40;

sub success {
    my ($content) = @_;
    return { success => 1, status => 200, reason => 'OK', content => $content };
}

sub failure {
    return { success => 0, status => 503, reason => 'Unavailable', content => '' };
}

sub client_with {
    my ( $http, $now_ref, %extra ) = @_;
    return Zengin::Pl->new(
        base_url     => $base,
        http_client  => $http,
        now_provider => sub { ${$now_ref} },
        %extra,
    );
}

subtest 'meta returns values, trims trailing whitespace, and preserves its keys' => sub {
    my $now = 1000;
    my $http = Local::MetaHTTP->new(
        $updated_url  => [ success("20260630\n") ],
        $revision_url => [ success("$sha1\r\n") ],
    );
    my $meta = client_with( $http, \$now )->meta;

    is_deeply(
        [ sort keys %{$meta} ],
        [ qw(base_url class source version) ],
        'meta() のトップレベルキー構造を維持する'
    );
    is_deeply(
        [ sort keys %{ $meta->{source} } ],
        [ qw(kind revision updated_at) ],
        'source のキー構造を維持する'
    );
    is( $meta->{class}, 'Zengin::Pl', 'class は canonical backend 名' );
    is( $meta->{version}, $Zengin::Pl::VERSION, 'version を返す' );
    is( $meta->{base_url}, $base, '実際に使う base_url を返す' );
    is( $meta->{source}{kind}, 'zengin-data-mirror', 'source.kind は固定値' );
    is( $meta->{source}{updated_at}, '20260630', 'updated_at の末尾改行を除去する' );
    is( $meta->{source}{revision}, $sha1, 'revision の末尾改行を除去する' );
};

subtest 'metadata values are cached independently until TTL expires' => sub {
    my $now = 1000;
    my $http = Local::MetaHTTP->new(
        $updated_url  => [ success('20260630'), success('20260701') ],
        $revision_url => [ success($sha1), success($sha2) ],
    );
    my $client = client_with( $http, \$now, cache_ttl => 60 );

    $client->meta;
    $now = 1059;
    my $cached = $client->meta;
    is( $cached->{source}{updated_at}, '20260630', 'TTL内はupdated_atを再利用する' );
    is( $cached->{source}{revision}, $sha1, 'TTL内はrevisionを再利用する' );
    is( $http->calls($updated_url), 1, 'TTL内のupdated_at取得は1回' );
    is( $http->calls($revision_url), 1, 'TTL内のrevision取得は1回' );

    $now = 1060;
    my $renewed = $client->meta;
    is( $renewed->{source}{updated_at}, '20260701', 'TTL切れ後にupdated_atを再取得する' );
    is( $renewed->{source}{revision}, lc $sha2, 'TTL切れ後にrevisionを再取得する' );
    is( $http->calls($updated_url), 2, 'updated_atを2回取得した' );
    is( $http->calls($revision_url), 2, 'revisionを2回取得した' );
};

subtest 'cache_ttl zero fetches metadata every time' => sub {
    my $now = 1000;
    my $http = Local::MetaHTTP->new(
        $updated_url  => [ success('20260630') ],
        $revision_url => [ success($sha1) ],
    );
    my $client = client_with( $http, \$now, cache_ttl => 0 );

    $client->meta for 1 .. 2;
    is( $http->calls($updated_url), 2, 'updated_atを毎回取得する' );
    is( $http->calls($revision_url), 2, 'revisionを毎回取得する' );
};

subtest 'one failed item is undef and retried without discarding the successful item' => sub {
    my $now = 1000;
    my $http = Local::MetaHTTP->new(
        $updated_url  => [ failure(), success('20260630') ],
        $revision_url => [ success($sha1) ],
    );
    my $client = client_with( $http, \$now );

    my $first = $client->meta;
    ok( !defined $first->{source}{updated_at}, 'updated_at取得失敗はundef' );
    is( $first->{source}{revision}, $sha1, '成功したrevisionは維持する' );

    my $second = $client->meta;
    is( $second->{source}{updated_at}, '20260630', '失敗したupdated_atは次回再取得する' );
    is( $second->{source}{revision}, $sha1, '成功したrevisionキャッシュを返す' );
    is( $http->calls($updated_url), 2, '失敗結果をキャッシュしない' );
    is( $http->calls($revision_url), 1, '成功結果だけキャッシュする' );
};

subtest 'failed revision is undef while updated_at remains available' => sub {
    my $now = 1000;
    my $http = Local::MetaHTTP->new(
        $updated_url  => [ success('20260630') ],
        $revision_url => [ failure(), success($sha1) ],
    );
    my $client = client_with( $http, \$now );

    my $first = $client->meta;
    is( $first->{source}{updated_at}, '20260630', 'updated_atの成功値を返す' );
    ok( !defined $first->{source}{revision}, 'revision取得失敗はundef' );

    my $second = $client->meta;
    is( $second->{source}{updated_at}, '20260630', 'updated_atキャッシュを維持する' );
    is( $second->{source}{revision}, $sha1, '失敗したrevisionは次回再取得する' );
    is( $http->calls($updated_url), 1, '成功したupdated_atは再取得しない' );
    is( $http->calls($revision_url), 2, 'revisionの失敗結果をキャッシュしない' );
};

subtest 'invalid revision and empty updated_at are undef and retried' => sub {
    my $now = 1000;
    my $http = Local::MetaHTTP->new(
        $updated_url  => [ success(" \r\n"), success('20260630') ],
        $revision_url => [ success('not-a-sha'), success($sha1) ],
    );
    my $client = client_with( $http, \$now );

    my $first = $client->meta;
    ok( !defined $first->{source}{updated_at}, '空のupdated_atはundef' );
    ok( !defined $first->{source}{revision}, '不正なrevisionはundef' );
    my $second = $client->meta;
    is( $second->{source}{updated_at}, '20260630', '空値の後にupdated_atを再取得する' );
    is( $second->{source}{revision}, $sha1, '不正値の後にrevisionを再取得する' );
};

subtest 'HTTP client exceptions do not make meta fail' => sub {
    my $now = 1000;
    my $http = Local::MetaHTTP->new(
        $revision_url => [ success($sha1) ],
    );
    my $meta = client_with( $http, \$now )->meta;
    ok( !defined $meta->{source}{updated_at}, '例外になった項目はundef' );
    is( $meta->{source}{revision}, $sha1, '他方の成功値は返す' );
};

subtest 'Zengin::Client compatibility' => sub {
    my $http = Local::MetaHTTP->new(
        $updated_url  => [ success('20260630') ],
        $revision_url => [ success($sha1) ],
    );
    my $client = Zengin::Client->new( base_url => $base, http_client => $http );
    my $meta = $client->meta;
    is( ref $meta, 'HASH', '互換レイヤからも meta() が呼べる' );
    is( $meta->{class}, 'Zengin::Pl', 'canonical backend 名を返す' );
};

done_testing;
