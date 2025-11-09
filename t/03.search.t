use strict;
use warnings;
use utf8;
use Test::More;
use Zengin::Client;

binmode Test::More->builder->output,         ':encoding(UTF-8)';
binmode Test::More->builder->failure_output, ':encoding(UTF-8)';

my $c =
  Zengin::Client->new( base_url =>
'https://raw.githubusercontent.com/sironekotoro/zengin-data-mirror/main/data'
  );

subtest 'search banks only' => sub {
    my $res = $c->search('みずほ');
    ok( ref $res eq 'ARRAY', '配列リファレンス' );
    ok( @$res > 0,           '1件以上ヒット' );
    like( $res->[0]->{name}, qr/みずほ/, 'みずほ銀行を含む' );
};

subtest 'search banks + branches' => sub {
    my $res = $c->search( 'みずほ', '東京' );
    ok( ref $res eq 'ARRAY',       '配列リファレンス' );
    ok( $res->[0]->{name} =~ /東京/, '支店名に東京' );
};

done_testing;
