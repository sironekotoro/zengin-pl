use strict;
use warnings;
use utf8;
use Test::More;
use Encode qw(encode_utf8);

use Zengin::Pl;

binmode Test::More->builder->output,         ':encoding(UTF-8)';
binmode Test::More->builder->failure_output, ':encoding(UTF-8)';
binmode Test::More->builder->todo_output,    ':encoding(UTF-8)';

{
    package Local::MockHTTP;

    sub new {
        my ( $class, %responses ) = @_;
        return bless { calls => {}, responses => \%responses }, $class;
    }

    sub get {
        my ( $self, $url ) = @_;
        $self->{calls}{$url}++;
        my $responses = $self->{responses}{$url} || [];
        my $response = @{$responses} > 1 ? shift @{$responses} : $responses->[0];
        die "No mock response for $url" unless $response;
        return $response;
    }

    sub calls {
        my ( $self, $url ) = @_;
        return $self->{calls}{$url} || 0;
    }
}

my $base         = 'https://example.test/data';
my $banks_url    = "$base/banks.json";
my $branches_1   = "$base/branches/0001.json";
my $branches_2   = "$base/branches/0002.json";
my $banks_json   = '{"0001":{"code":"0001","name":"みずほ銀行"},"0002":{"code":"0002","name":"第二銀行"}}';
my $branches_1_json = '{"001":{"code":"001","name":"東京営業部"}}';
my $branches_2_json = '{"002":{"code":"002","name":"大阪支店"}}';

sub success {
    my ($content) = @_;
    return {
        success => 1,
        status  => 200,
        reason  => 'OK',
        content => encode_utf8($content),
    };
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

subtest 'banks are cached until TTL expires' => sub {
    my $now = 1000;
    my $http = Local::MockHTTP->new( $banks_url => [ success($banks_json) ] );
    my $client = client_with( $http, \$now, cache_ttl => 60 );

    my $first = $client->get_all_banks;
    is( $http->calls($banks_url), 1, '初回はHTTP取得する' );
    $now = 1059;
    is( $client->get_all_banks, $first, 'TTL内はキャッシュを返す' );
    is( $http->calls($banks_url), 1, 'TTL内は再取得しない' );
    $now = 1060;
    $client->get_all_banks;
    is( $http->calls($banks_url), 2, 'TTL切れ後は再取得する' );
};

subtest 'cache_ttl zero disables caching' => sub {
    my $now = 1000;
    my $http = Local::MockHTTP->new( $banks_url => [ success($banks_json) ] );
    my $client = client_with( $http, \$now, cache_ttl => 0 );

    $client->get_all_banks for 1 .. 2;
    is( $http->calls($banks_url), 2, '毎回HTTP取得する' );
};

subtest 'branch caches are independent per bank' => sub {
    my $now = 1000;
    my $http = Local::MockHTTP->new(
        $branches_1 => [ success($branches_1_json) ],
        $branches_2 => [ success($branches_2_json) ],
    );
    my $client = client_with( $http, \$now, cache_ttl => 60 );

    my $first = $client->get_branches('0001');
    is( $client->get_branches('0001'), $first, '同じ銀行はキャッシュを返す' );
    is( $http->calls($branches_1), 1, '同じ銀行を再取得しない' );
    my $second = $client->get_branches('0002');
    is( $http->calls($branches_2), 1, '異なる銀行は初回取得する' );
    isnt( $second, $first, '別銀行のキャッシュを流用しない' );
    is( $second->{'002'}{name}, '大阪支店', '別銀行の正しいデータを返す' );

    $now = 1060;
    $client->get_branches('0001');
    is( $http->calls($branches_1), 2, '期限切れの銀行だけ再取得する' );
    is( $http->calls($branches_2), 1, '未呼び出しの別銀行は再取得しない' );
};

subtest 'HTTP failures are not cached' => sub {
    my $now = 1000;
    my $http = Local::MockHTTP->new(
        $banks_url => [ failure(), success($banks_json) ],
    );
    my $client = client_with( $http, \$now );

    eval { $client->get_all_banks };
    like( $@, qr/^Failed to fetch banks: 503 Unavailable/, '既存形式の例外を送出する' );
    my $banks = $client->get_all_banks;
    is( $http->calls($banks_url), 2, '失敗後は再度HTTP取得する' );
    is( $banks->{'0001'}{name}, 'みずほ銀行', '再取得成功結果を返す' );
};

subtest 'JSON decode failures are not cached' => sub {
    my $now = 1000;
    my $http = Local::MockHTTP->new(
        $branches_1 => [ success('{invalid'), success($branches_1_json) ],
    );
    my $client = client_with( $http, \$now );

    eval { $client->get_branches('0001') };
    ok( $@, 'JSONデコード失敗は例外になる' );
    my $branches = $client->get_branches('0001');
    is( $http->calls($branches_1), 2, 'デコード失敗後は再度HTTP取得する' );
    is( $branches->{'001'}{name}, '東京営業部', '再取得成功結果を返す' );
};

subtest 'public lookup and search methods reuse caches' => sub {
    my $now = 1000;
    my $http = Local::MockHTTP->new(
        $banks_url  => [ success($banks_json) ],
        $branches_1 => [ success($branches_1_json) ],
    );
    my $client = client_with( $http, \$now );

    is( $client->get_bank('0001')->{name}, 'みずほ銀行', 'get_bankの結果は従来どおり' );
    is( $client->get_bank('0001')->{name}, 'みずほ銀行', 'get_bankはキャッシュを利用できる' );
    is( $http->calls($banks_url), 1, '銀行一覧取得は1回だけ' );
    is( $client->get_branch( '0001', '001' )->{name}, '東京営業部', 'get_branchの結果は従来どおり' );
    is( $client->get_branch( '0001', '001' )->{name}, '東京営業部', 'get_branchはキャッシュを利用できる' );
    is( $http->calls($branches_1), 1, '支店一覧取得は1回だけ' );

    my $results = $client->search( 'みずほ', '東京' );
    is( scalar @{$results}, 1, 'searchのヒット件数は従来どおり' );
    is( $results->[0]{code}, '001', 'searchは従来形式の支店を返す' );
    is( $http->calls($banks_url), 1, 'searchも銀行キャッシュを利用する' );
    is( $http->calls($branches_1), 1, 'searchも支店キャッシュを利用する' );
};

done_testing;
