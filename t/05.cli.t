use strict;
use warnings;
use utf8;
use open qw(:std :encoding(UTF-8));
use Test::More;

use Encode qw(decode encode);
use IPC::Open3;
use Symbol qw(gensym);

binmode Test::More->builder->output,         ':encoding(UTF-8)';
binmode Test::More->builder->failure_output, ':encoding(UTF-8)';
binmode Test::More->builder->todo_output,    ':encoding(UTF-8)';

sub run_cli {
    my (%args) = @_;
    my @command = (
        $^X,
        '-It/lib',
        '-MZengin::CLITestMock',
        'script/zengin',
        @{ $args{argv} || [] }
    );

    local %ENV = ( %ENV, %{ $args{env} || {} } );

    my $stderr = gensym;
    my $pid = open3( undef, my $stdout, $stderr, @command );
    binmode $stdout, ':raw';
    binmode $stderr, ':raw';
    my $out = do { local $/; <$stdout> };
    my $err = do { local $/; <$stderr> };
    waitpid $pid, 0;
    my $exit = $? >> 8;

    return ( $out, $err, $exit );
}

subtest 'bank code lookup' => sub {
    my ( $out, $err, $exit ) = run_cli( argv => ['0001'] );

    is( $exit, 0, '正常終了する' );
    is( decode( 'UTF-8', $out ), "0001\tみずほ銀行\n", '銀行コードで単体取得できる' );
    is( $err, '', '標準エラーは空' );
};

subtest 'bank name search' => sub {
    my ( $out, $err, $exit ) = run_cli( argv => ['三菱'] );

    is( $exit, 0, '正常終了する' );
    is( decode( 'UTF-8', $out ), "0005\t三菱ＵＦＪ銀行\n", '銀行名で曖昧検索できる' );
    is( $err, '', '標準エラーは空' );
};

subtest 'branch search by bank and branch name' => sub {
    my ( $out, $err, $exit ) = run_cli( argv => [ '三菱', '東京' ] );

    is( $exit, 0, '正常終了する' );
    is( decode( 'UTF-8', $out ), "0005\t002\t東京営業部\n", '銀行名と支店名で検索できる' );
    is( $err, '', '標準エラーは空' );
};

subtest 'branch lookup by codes' => sub {
    my ( $out, $err, $exit ) = run_cli( argv => [ '0005', '001' ] );

    is( $exit, 0, '正常終了する' );
    is( decode( 'UTF-8', $out ), "0005\t001\t本店\n", '銀行コードと支店コードで単体取得できる' );
    is( $err, '', '標準エラーは空' );
};

subtest 'not found' => sub {
    my ( $out, $err, $exit ) = run_cli( argv => ['存在しない銀行'] );

    is( $exit, 0, '0件でも正常終了する' );
    is( decode( 'UTF-8', $out ), "not found\n", '0件なら not found を出力する' );
    is( $err, '', '標準エラーは空' );
};

subtest 'invalid arguments show usage' => sub {
    my ( $out, $err, $exit ) = run_cli( argv => [ 'a', 'b', 'c' ] );

    is( $exit, 1, '不正引数は非0終了' );
    is( $out, '', '標準出力は空' );
    like( $err, qr/\Ausage:/, 'usage を表示する' );
};

subtest 'Windows cp932 arguments are decoded' => sub {
    my ( $out, $err, $exit ) = run_cli(
        argv => [ encode( 'cp932', '三菱' ) ],
        env  => {
            ZENGIN_CLI_FORCE_WINDOWS => 1,
        },
    );

    is( $exit, 0, '正常終了する' );
    is( decode( 'cp932', $out ), "0005\t三菱ＵＦＪ銀行\n", 'cp932 引数でも検索できる' );
    is( $err, '', '標準エラーは空' );
};

done_testing;
