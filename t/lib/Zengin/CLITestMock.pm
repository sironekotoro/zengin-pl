package Zengin::CLITestMock;
use strict;
use warnings;
use utf8;

use Zengin::Pl ();

my %BANKS = (
    '0001' => {
        code => '0001',
        name => 'みずほ銀行',
        kana => 'ミズホ',
        hira => 'みずほ',
    },
    '0005' => {
        code => '0005',
        name => '三菱ＵＦＪ銀行',
        kana => 'ミツビシユーエフジェイ',
        hira => 'みつびしゆーえふじぇい',
    },
);

my %BRANCHES = (
    '0001' => {
        '001' => {
            code => '001',
            name => '東京営業部',
            kana => 'トウキョウ',
            hira => 'とうきょう',
        },
        '101' => {
            code => '101',
            name => '新宿支店',
            kana => 'シンジュク',
            hira => 'しんじゅく',
        },
    },
    '0005' => {
        '001' => {
            code => '001',
            name => '本店',
            kana => 'ホンテン',
            hira => 'ほんてん',
        },
        '002' => {
            code => '002',
            name => '東京営業部',
            kana => 'トウキョウ',
            hira => 'とうきょう',
        },
    },
);

sub import {
    no warnings 'redefine';

    *Zengin::Pl::new = sub {
        return bless {}, 'Zengin::Pl';
    };
    *Zengin::Pl::get_bank = sub {
        my ( undef, $code ) = @_;
        return $BANKS{$code};
    };
    *Zengin::Pl::get_branch = sub {
        my ( undef, $bank_code, $branch_code ) = @_;
        return $BRANCHES{$bank_code}{$branch_code};
    };
    *Zengin::Pl::get_branches = sub {
        my ( undef, $bank_code ) = @_;
        return $BRANCHES{$bank_code} || {};
    };
    *Zengin::Pl::search = sub {
        my ( undef, $bank_pat ) = @_;
        my @banks = grep { _matches( $_, $bank_pat ) } values %BANKS;
        @banks = sort { $a->{code} cmp $b->{code} } @banks;
        return \@banks;
    };
}

sub _matches {
    my ( $row, $pattern ) = @_;
    return 1 if defined $row->{name} && $row->{name} =~ /\Q$pattern\E/;
    return 1 if defined $row->{kana} && $row->{kana} =~ /\Q$pattern\E/;
    return 1 if defined $row->{hira} && $row->{hira} =~ /\Q$pattern\E/;
    return 1 if defined $row->{code} && $row->{code} =~ /\Q$pattern\E/;
    return 0;
}

1;
