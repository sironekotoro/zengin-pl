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

subtest 'Zengin::Pl meta returns backend information' => sub {
    my $client = Zengin::Pl->new();
    my $meta   = $client->meta();

    is( ref $meta, 'HASH', 'meta() はハッシュリファレンスを返す' );
    is( $meta->{class}, 'Zengin::Pl', 'class は canonical backend 名' );
    is( $meta->{version}, $Zengin::Pl::VERSION, 'version を返す' );
    is(
        $meta->{base_url},
        'https://raw.githubusercontent.com/sironekotoro/zengin-data-mirror/main/data',
        '実際に使う base_url を返す'
    );
    is( ref $meta->{source}, 'HASH', 'source はハッシュリファレンス' );
    ok( exists $meta->{source}->{kind}, 'source.kind キーを持つ' );
    ok( exists $meta->{source}->{revision}, 'source.revision キーを持つ' );
    ok( exists $meta->{source}->{updated_at}, 'source.updated_at キーを持つ' );
    is( $meta->{source}->{kind}, 'zengin-data-mirror', 'source.kind は固定値' );
    ok( !defined $meta->{source}->{revision}, 'source.revision は未実装なので undef' );
    ok( !defined $meta->{source}->{updated_at}, 'source.updated_at は未実装なので undef' );
};

subtest 'meta respects overridden base_url' => sub {
    my $client = Zengin::Pl->new( base_url => 'https://example.com/zengin/' );
    my $meta   = $client->meta();

    is( $meta->{base_url}, 'https://example.com/zengin', '末尾スラッシュを除いた base_url を返す' );
};

subtest 'Zengin::Client compatibility' => sub {
    my $client = Zengin::Client->new();
    my $meta   = $client->meta();

    is( ref $meta, 'HASH', '互換レイヤからも meta() が呼べる' );
    is( $meta->{class}, 'Zengin::Pl', 'class は canonical backend 名を返す' );
};

done_testing;
