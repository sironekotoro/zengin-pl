package Zengin::Pl;
use strict;
use warnings;
use utf8;
use HTTP::Tiny;
use JSON::XS;

our $VERSION = "0.01";
our $DEFAULT_BASE_URL
  = 'https://raw.githubusercontent.com/sironekotoro/zengin-data-mirror/main/data';
our $DEFAULT_CACHE_TTL = 21600;

sub new {
    my ( $class, %args ) = @_;
    my $base = $args{base_url} || $DEFAULT_BASE_URL;
    $base =~ s{/$}{};
    return bless {
        base_url       => $base,
        cache_ttl      => defined $args{cache_ttl} ? $args{cache_ttl} : $DEFAULT_CACHE_TTL,
        now_provider   => $args{now_provider} || sub { time },
        http_client    => $args{http_client} || HTTP::Tiny->new,
        branches_cache => {},
        metadata_cache => {},
    }, $class;
}

sub _cached_value {
    my ( $self, $cache ) = @_;
    return unless $self->{cache_ttl} > 0 && $cache;

    my $now = $self->{now_provider}->();
    return if $now - $cache->{fetched_at} >= $self->{cache_ttl};
    return ( 1, $cache->{value} );
}

sub meta {
    my ($self) = @_;
    my $updated_at = $self->_metadata_value('updated_at');
    my $revision   = $self->_metadata_value('revision');
    return {
        class    => __PACKAGE__,
        version  => $VERSION,
        base_url => $self->{base_url},
        source   => {
            kind       => 'zengin-data-mirror',
            revision   => $revision,
            updated_at => $updated_at,
        },
    };
}

sub _metadata_value {
    my ( $self, $name ) = @_;
    my ( $cached, $value ) =
      $self->_cached_value( $self->{metadata_cache}{$name} );
    return $value if $cached;

    my $res = eval { $self->{http_client}->get("$self->{base_url}/$name") };
    return unless $res && $res->{success} && defined $res->{content};

    $value = $res->{content};
    $value =~ s/\s+\z//;
    return unless length $value;
    return if $name eq 'revision' && $value !~ /\A[0-9a-f]{40}\z/i;
    $value = lc $value if $name eq 'revision';

    $self->{metadata_cache}{$name} = {
        value      => $value,
        fetched_at => $self->{now_provider}->(),
    } if $self->{cache_ttl} > 0;
    return $value;
}

sub get_all_banks {
    my ($self) = @_;
    my ( $cached, $value ) = $self->_cached_value( $self->{banks_cache} );
    return $value if $cached;

    my $url    = "$self->{base_url}/banks.json";
    my $res    = $self->{http_client}->get($url);
    die "Failed to fetch banks: $res->{status} $res->{reason}"
      unless $res->{success};
    my $banks = decode_json( $res->{content} );
    $self->{banks_cache} = {
        value      => $banks,
        fetched_at => $self->{now_provider}->(),
    } if $self->{cache_ttl} > 0;
    return $banks;
}

sub get_branches {
    my ( $self, $bank_code ) = @_;
    my ( $cached, $value ) =
      $self->_cached_value( $self->{branches_cache}{$bank_code} );
    return $value if $cached;

    my $url = sprintf( "%s/branches/%s.json", $self->{base_url}, $bank_code );
    my $res = $self->{http_client}->get($url);
    die "Failed to fetch branches for $bank_code: $res->{status} $res->{reason}"
      unless $res->{success};
    my $branches = decode_json( $res->{content} );
    $self->{branches_cache}{$bank_code} = {
        value      => $branches,
        fetched_at => $self->{now_provider}->(),
    } if $self->{cache_ttl} > 0;
    return $branches;
}

sub get_bank {
    my ( $self, $code ) = @_;
    my $banks = $self->get_all_banks();
    return $banks->{$code};
}

sub get_branch {
    my ( $self, $bank_code, $branch_code ) = @_;
    my $branches = $self->get_branches($bank_code);
    return $branches->{$branch_code};
}

sub search {
    my ( $self, $bank_pat, $branch_pat ) = @_;
    my $bank_rx = ref $bank_pat ? $bank_pat : qr/\Q$bank_pat\E/;
    my $branch_rx =
      defined $branch_pat
      ? ( ref $branch_pat ? $branch_pat : qr/\Q$branch_pat\E/ )
      : undef;

    my $banks = $self->get_all_banks;
    my @matched_banks = grep {
        my $bank = $banks->{$_};
        $bank->{name} =~ $bank_rx
          || ( $bank->{kana} && $bank->{kana} =~ $bank_rx )
          || ( $bank->{hira} && $bank->{hira} =~ $bank_rx )
          || ( $bank->{code} && $bank->{code} =~ $bank_rx )
    } keys %{$banks};

    unless ( defined $branch_rx ) {
        my @results = map { $banks->{$_} } @matched_banks;
        return \@results;
    }

    my @results;
    for my $code (@matched_banks) {
        my $branches = $self->get_branches($code);
        for my $branch_code ( keys %{$branches} ) {
            my $branch = $branches->{$branch_code};
            if (   $branch->{name} =~ $branch_rx
                || ( $branch->{kana} && $branch->{kana} =~ $branch_rx )
                || ( $branch->{hira} && $branch->{hira} =~ $branch_rx )
                || ( $branch->{code} && $branch->{code} =~ $branch_rx ) )
            {
                push @results, $branch;
            }
        }
    }
    return \@results;
}

1;
__END__

=encoding utf-8

=head1 NAME

Zengin::Pl - Lightweight Perl client for Zengin Code (全銀協コード) JSON dataset

=head1 SYNOPSIS

    use Zengin::Pl;

    my $client = Zengin::Pl->new();

    my $banks = $client->search('みずほ');
    printf "%s: %s\n", $_->{code}, $_->{name} for @$banks;

    my $branches = $client->search('みずほ', '東京');
    printf "%s: %s\n", $_->{code}, $_->{name} for @$branches;

=head1 DESCRIPTION

Zengin::Pl は、全銀協コードの JSON データを Perl から取得・検索するための
軽量クライアントです。

=head1 METHODS

=head2 new(%args)

クライアントインスタンスを生成します。

=head2 get_all_banks

全銀行情報を取得します。

=head2 get_branches($bank_code)

指定した銀行コードに対応する支店一覧を取得します。

=head2 get_bank($code)

単一の銀行情報を取得します。

=head2 get_branch($bank_code, $branch_code)

単一の支店情報を取得します。

=head2 search($bank_pattern, [$branch_pattern])

部分一致または正規表現で銀行名／支店名を検索します。

=head2 meta()

backend 自身のメタ情報をハッシュリファレンスで返します。
C<class>、C<version>、C<base_url> と、
C<source.kind>、C<source.revision>、C<source.updated_at> を返します。

=head1 LICENSE

MIT License

=head1 AUTHOR

sironekotoro E<lt>8675420+sironekotoro@users.noreply.github.comE<gt>

=cut
