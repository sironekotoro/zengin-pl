package Zengin::Pl::CLI;
use strict;
use warnings;
use utf8;

use Encode qw(decode is_utf8 FB_CROAK);
use Zengin::Pl;

sub run {
    my ( $class, @argv ) = @_;

    _configure_io();
    @argv = map { _normalize_arg($_) } @argv;

    return _usage(1) unless @argv == 1 || @argv == 2;

    my $client = _build_client();
    my @lines;

    my $ok = eval {
        if ( @argv == 1 && $argv[0] =~ /\A\d+\z/ ) {
            my $bank = $client->get_bank( $argv[0] );
            @lines = $bank ? ( _format_bank($bank) ) : ();
            return 1;
        }

        if ( @argv == 2 && $argv[0] =~ /\A\d+\z/ && $argv[1] =~ /\A\d+\z/ ) {
            my $branch = $client->get_branch( $argv[0], $argv[1] );
            @lines = $branch ? ( _format_branch( $argv[0], $branch ) ) : ();
            return 1;
        }

        if ( @argv == 1 ) {
            my $banks = $client->search( $argv[0] );
            @lines = map { _format_bank($_) } _sort_banks( @{$banks} );
            return 1;
        }

        my $rows = _search_branches( $client, @argv );
        @lines = map { _format_branch( $_->{bank_code}, $_->{branch} ) } @{$rows};
        return 1;
    };

    unless ($ok) {
        my $error = $@ || 'unknown error';
        chomp $error;
        print STDERR "$error\n";
        return 1;
    }

    if (@lines) {
        print STDOUT "$_\n" for @lines;
    }
    else {
        print STDOUT "not found\n";
    }

    return 0;
}

sub _build_client {
    my %args;
    if ( defined $ENV{ZENGIN_BASE_URL} && length $ENV{ZENGIN_BASE_URL} ) {
        $args{base_url} = $ENV{ZENGIN_BASE_URL};
    }
    return Zengin::Pl->new(%args);
}

sub _usage {
    my ($exit_code) = @_;
    print STDERR <<"USAGE";
usage:
  zengin <bank_name>
  zengin <bank_code>
  zengin <bank_name> <branch_name>
  zengin <bank_code> <branch_code>
USAGE
    return $exit_code;
}

sub _configure_io {
    my $encoding = _is_windows() ? 'cp932' : 'UTF-8';
    binmode STDOUT, ":encoding($encoding)";
    binmode STDERR, ":encoding($encoding)";
}

sub _is_windows {
    return $ENV{ZENGIN_CLI_FORCE_WINDOWS}
      if defined $ENV{ZENGIN_CLI_FORCE_WINDOWS};
    return $^O eq 'MSWin32';
}

sub _normalize_arg {
    my ($arg) = @_;
    return $arg if !defined $arg || is_utf8($arg);

    my $encoding = _is_windows() ? 'cp932' : 'UTF-8';
    my $decoded = eval { decode( $encoding, $arg, FB_CROAK ) };
    return defined $decoded ? $decoded : $arg;
}

sub _search_branches {
    my ( $client, $bank_pat, $branch_pat ) = @_;
    my $banks = $client->search($bank_pat);
    my @results;

    for my $bank ( _sort_banks( @{$banks} ) ) {
        my $branches = $client->get_branches( $bank->{code} );
        for my $branch_code ( sort keys %{$branches} ) {
            my $branch = $branches->{$branch_code};
            next unless _matches( $branch, $branch_pat );
            push @results,
              {
                bank_code => $bank->{code},
                branch    => $branch,
              };
        }
    }

    return \@results;
}

sub _matches {
    my ( $row, $pattern ) = @_;
    my $rx = qr/\Q$pattern\E/;

    return 1 if defined $row->{name} && $row->{name} =~ $rx;
    return 1 if defined $row->{kana} && $row->{kana} =~ $rx;
    return 1 if defined $row->{hira} && $row->{hira} =~ $rx;
    return 1 if defined $row->{code} && $row->{code} =~ $rx;
    return 0;
}

sub _sort_banks {
    return sort { $a->{code} cmp $b->{code} } @_;
}

sub _format_bank {
    my ($bank) = @_;
    return join "\t", $bank->{code}, $bank->{name};
}

sub _format_branch {
    my ( $bank_code, $branch ) = @_;
    return join "\t", $bank_code, $branch->{code}, $branch->{name};
}

1;
