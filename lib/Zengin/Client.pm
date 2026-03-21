package Zengin::Client;
use strict;
use warnings;
use utf8;
use HTTP::Tiny;
use JSON::XS;

our $VERSION = "0.01";

# https://chatgpt.com/c/68289bfb-a8c8-8012-b56a-7afb7e4bde23

sub new {
    my ( $class, %args ) = @_;
    my $base = $args{base_url}
      || 'https://raw.githubusercontent.com/sironekotoro/zengin-data-mirror/main/data';
    $base =~ s{/$}{};
    return bless { base_url => $base }, $class;
}

sub get_all_banks {
    my ($self) = @_;
    my $url    = "$self->{base_url}/banks.json";
    my $res    = HTTP::Tiny->new->get($url);
    die "Failed to fetch banks for $res: $res->{status} $res->{reason}"
      unless $res->{success};
    return decode_json( $res->{content} );
}

sub get_branches {
    my ( $self, $bank_code ) = @_;
    my $url = sprintf( "%s/branches/%s.json", $self->{base_url}, $bank_code );
    my $res = HTTP::Tiny->new->get($url);
    die "Failed to fetch branches for $bank_code: $res->{status} $res->{reason}"
      unless $res->{success};
    return decode_json( $res->{content} );
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

# 曖昧検索メソッド
#
# 引数1：銀行名のパターン（部分一致 or 正規表現文字列）
# 引数2（任意）：支店名のパターン
#
# 戻り値：
#  ・引数1つの場合…マッチした銀行のハッシュリファレンスを要素に持つ配列リファレンス
#  ・引数2つの場合…マッチした支店のハッシュリファレンスを要素に持つ配列リファレンス
#
sub search {
    my ( $self, $bank_pat, $branch_pat ) = @_;
    my $bank_rx = ref $bank_pat ? $bank_pat : qr/\Q$bank_pat\E/;
    my $branch_rx =
      defined $branch_pat
      ? ( ref $branch_pat ? $branch_pat : qr/\Q$branch_pat\E/ )
      : undef;

    # 1) 全銀行をスキャン
    my $banks         = $self->get_all_banks;    # HASHREF
    my @matched_banks = grep {
        my $b = $banks->{$_};
        $b->{name} =~ $bank_rx
          || ( $b->{kana} && $b->{kana} =~ $bank_rx )
          || ( $b->{hira} && $b->{hira} =~ $bank_rx )
          || ( $b->{code} && $b->{code} =~ $bank_rx )
    } keys %$banks;

    # 引数2つ無しなら銀行検索結果を返す
    unless ( defined $branch_rx ) {
        my @results = map { $banks->{$_} } @matched_banks;
        return \@results;
    }

    # 2) 支店も検索する場合
    my @results;
    for my $code (@matched_banks) {
        my $bank     = $banks->{$code};
        my $branches = $self->get_branches($code);    # HASHREF
        for my $bcode ( keys %$branches ) {
            my $br = $branches->{$bcode};
            if (   $br->{name} =~ $branch_rx
                || ( $br->{kana} && $br->{kana} =~ $branch_rx )
                || ( $br->{hira} && $br->{hira} =~ $branch_rx )
                || ( $br->{code} && $br->{code} =~ $branch_rx ) )
            {
                push @results, $br;
            }
        }
    }
    return \@results;
}

1;
__END__

=encoding utf-8

=head1 NAME

Zengin::Client - Lightweight Perl client for Zengin Code (全銀協コード) JSON dataset

=head1 SYNOPSIS

    use Zengin::Client;

    my $client = Zengin::Client->new();

    # 銀行名で検索
    my $banks = $client->search('みずほ');
    printf "%s: %s\n", $_->{code}, $_->{name} for @$banks;

    # 銀行名 + 支店名で検索
    my $branches = $client->search('みずほ', '東京');
    printf "%s: %s\n", $_->{code}, $_->{name} for @$branches;

    # 全銀行一覧を取得
    my $all_banks = $client->get_all_banks();
    printf "%s: %s\n", $_, $all_banks->{$_}->{name} for sort keys %$all_banks;

    # 単一の銀行／支店を取得
    my $bank   = $client->get_bank('0001');
    my $branch = $client->get_branch('0001', '001');
    printf "%s\n", $bank->{name};
    printf "%s\n", $branch->{name};

=head1 DESCRIPTION

Zengin::Client は、ZenginCode プロジェクト（全銀協コードをオープンデータ化したもの）で公開されている JSON データを、
Perl から簡単に取得・操作するための軽量クライアントです。

現在の実装では、GitHub 上の以下の JSON を取得します：

=over 4

=item L<https://raw.githubusercontent.com/sironekotoro/zengin-data-mirror/main/data/banks.json>

=item L<https://raw.githubusercontent.com/sironekotoro/zengin-data-mirror/main/data/branches/0001.json>

=back

=head1 METHODS

=head2 new(%args)

    my $client = Zengin::Client->new(%args);

クライアントインスタンスを生成します。以下のオプションを指定できます：

=over 4

=item * base_url

JSON データの取得先 URL を指定します。
デフォルトでは C<https://raw.githubusercontent.com/sironekotoro/zengin-data-mirror/main/data>
を参照します。

=back

=head2 get_all_banks

    my $banks = $client->get_all_banks();

    map { print $banks->{$_}->{name} . "\n" } sort keys %$banks;    # みずほ, 三菱ＵＦＪ, 三井住友 ...

全銀行情報を取得します。戻り値はハッシュリファレンスで、キーは銀行コード、値は銀行情報のハッシュです。

=head2 get_branches($bank_code)

    my $branches = $client->get_branches("0001");

    map { print $branches->{$_}->{name} } sort keys %$branches; # 東京営業部, 丸の内中央, 丸之内, ...

指定した銀行コードに対応する支店一覧を取得します。戻り値はハッシュリファレンスです。

=head2 get_bank($code)

    my $bank = $client->get_bank("0001");

    print $bank->{code} . "\n";    # 0001
    print $bank->{name} . "\n";    # みずほ
    print $bank->{kana} . "\n";    # ミズホ
    print $bank->{hira} . "\n";    # みずほ
    print $bank->{roma} . "\n";    # mizuho

銀行コードを指定して、単一の銀行情報（ハッシュリファレンス）を取得します。

=head2 get_branch($bank_code, $branch_code)

    my $branch = $client->get_branch("0001", "001");

    print $branch->{code} . "\n";    # 001
    print $branch->{name} . "\n";    # 東京営業部
    print $branch->{kana} . "\n";    # トウキヨウ
    print $branch->{hira} . "\n";    # とうきよう
    print $branch->{roma} . "\n";    # toukiyou

銀行コードと支店コードを指定して、支店情報を取得します。

=head2 search($bank_pattern, [$branch_pattern])

部分一致または正規表現で銀行名／支店名を検索します。

    # 引数1つ: 銀行名のみ検索
    my $banks = $client->search('みずほ');

    # 引数2つ: 銀行名 + 支店名検索
    my $branches = $client->search('みずほ', '東京');

引数１つの場合は `get_all_banks` の結果から銀行だけをフィルタした配列リファレンス、
引数２つの場合は `get_branches` の結果から支店だけをフィルタした配列リファレンスを返します。

=head1 LICENSE

Copyright (C) sironekotoro.

This library is free software; you can redistribute it and/or modify
it under the same terms as Perl itself.

=head1 AUTHOR

sironekotoro E<lt>8675420+sironekotoro@users.noreply.github.comE<gt>

=cut
