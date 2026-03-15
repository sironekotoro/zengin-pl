#!/usr/bin/env perl
use strict;
use warnings;
use utf8;

use FindBin;
use lib "$FindBin::Bin/../lib";

use HTTP::Tiny;
use JSON::PP qw(encode_json decode_json);
use Time::Piece;
use Zengin::Client;

my $SPREADSHEET_ID   = '1SAFslvoQiMtwMTRBXX_FzOlO6Bgtw7ebmNJBcyBY9rI';
my $GOOGLE_SHEET_API = 'https://sheets.googleapis.com/v4/spreadsheets/';

my $mirror_updated_at = $ENV{MIRROR_UPDATED_AT}
  or die "MIRROR_UPDATED_AT is required\n";
my $synced_at = $ENV{SYNCED_AT}
  || localtime->strftime('%Y-%m-%d %H:%M:%S');

my $access_token = access_token(
    client_id     => $ENV{SIRONEKOTORO_CLIENT_ID},
    client_secret => $ENV{SIRONEKOTORO_CLIENT_SECRET},
    refresh_token => $ENV{SIRONEKOTORO_REFRESH_TOKEN},
);

my $bearer = "Bearer $access_token";
my $client = Zengin::Client->new();

my $banks    = bank_rows($client);
my $branches = branch_rows($client);

my $sheetname_to_sheetid = get_sheets(
    google_sheet_api => $GOOGLE_SHEET_API,
    spreadsheet_id   => $SPREADSHEET_ID,
    bearer           => $bearer,
);

set_column_format_to_text(
    google_sheet_api => $GOOGLE_SHEET_API,
    spreadsheet_id   => $SPREADSHEET_ID,
    sheet_id         => $sheetname_to_sheetid->{'銀行'},
    column_index     => 0,
    bearer           => $bearer,
);
set_column_format_to_text(
    google_sheet_api => $GOOGLE_SHEET_API,
    spreadsheet_id   => $SPREADSHEET_ID,
    sheet_id         => $sheetname_to_sheetid->{'支店'},
    column_index     => 0,
    bearer           => $bearer,
);
set_column_format_to_text(
    google_sheet_api => $GOOGLE_SHEET_API,
    spreadsheet_id   => $SPREADSHEET_ID,
    sheet_id         => $sheetname_to_sheetid->{'支店'},
    column_index     => 1,
    bearer           => $bearer,
);

clear_and_fill(
    google_sheet_api => $GOOGLE_SHEET_API,
    spreadsheet_id   => $SPREADSHEET_ID,
    bearer           => $bearer,
    sheetname_to_id  => $sheetname_to_sheetid,
    sheet_name       => '銀行',
    values           => $banks,
    header_line      => [ '金融機関コード', '金融機関名', '金融機関名フリガナ' ],
);

clear_and_fill(
    google_sheet_api => $GOOGLE_SHEET_API,
    spreadsheet_id   => $SPREADSHEET_ID,
    bearer           => $bearer,
    sheetname_to_id  => $sheetname_to_sheetid,
    sheet_name       => '支店',
    values           => $branches,
    header_line      => [ '金融機関コード', '支店コード', '支店名', '支店名フリガナ' ],
);

values_batch_update(
    google_sheet_api => $GOOGLE_SHEET_API,
    spreadsheet_id   => $SPREADSHEET_ID,
    sheet_name       => '解説',
    bearer           => $bearer,
    values           => [
        [ "データ更新日: $mirror_updated_at" ],
        [ "反映日時: $synced_at" ],
    ],
);

print "Updated Google Sheets with " . scalar(@$banks) . " banks and "
  . scalar(@$branches) . " branches\n";

sub bank_rows {
    my ($client) = @_;
    my $banks = $client->get_all_banks();
    my @rows;
    for my $code ( sort keys %{$banks} ) {
        my $bank = $banks->{$code};
        push @rows, [ $code, $bank->{name}, $bank->{kana} || '' ];
    }
    return \@rows;
}

sub branch_rows {
    my ($client) = @_;
    my $banks = $client->get_all_banks();
    my @rows;
    for my $bank_code ( sort keys %{$banks} ) {
        my $branches = $client->get_branches($bank_code);
        for my $branch_code ( sort keys %{$branches} ) {
            my $branch = $branches->{$branch_code};
            push @rows,
              [ $bank_code, $branch_code, $branch->{name}, $branch->{kana} || '' ];
        }
    }
    return \@rows;
}

sub clear_and_fill {
    my (%args) = @_;
    sheet_clear(
        google_sheet_api => $args{google_sheet_api},
        spreadsheet_id   => $args{spreadsheet_id},
        sheet_id         => $args{sheetname_to_id}->{ $args{sheet_name} },
        bearer           => $args{bearer},
    );

    values_batch_update(
        google_sheet_api => $args{google_sheet_api},
        spreadsheet_id   => $args{spreadsheet_id},
        sheet_name       => $args{sheet_name},
        bearer           => $args{bearer},
        header_line      => $args{header_line},
        values           => $args{values},
    );
}

sub values_batch_update {
    my (%args) = @_;
    my $rows = $args{values} || [];
    my @values = @{$rows};

    if ( $args{header_line} ) {
        unshift @values, $args{header_line};
    }

    api_request_json(
        method => 'POST',
        url =>
          $args{google_sheet_api} . $args{spreadsheet_id} . '/values:batchUpdate',
        bearer => $args{bearer},
        payload => {
            valueInputOption => 'USER_ENTERED',
            data             => [
                {
                    range  => $args{sheet_name} . '!A1',
                    values => \@values,
                }
            ],
            includeValuesInResponse      => JSON::PP::false,
            responseValueRenderOption    => 'UNFORMATTED_VALUE',
            responseDateTimeRenderOption => 'FORMATTED_STRING',
        },
    );
}

sub access_token {
    my (%args) = @_;
    for my $key (qw(client_id client_secret refresh_token)) {
        die uc($key) . " is required\n" unless defined $args{$key} && length $args{$key};
    }

    my $response = api_request_json(
        method => 'POST',
        url    => 'https://oauth2.googleapis.com/token',
        headers => {
            'content-type' => 'application/x-www-form-urlencoded',
        },
        form => [
            client_id     => $args{client_id},
            client_secret => $args{client_secret},
            grant_type    => 'refresh_token',
            refresh_token => $args{refresh_token},
        ],
    );

    die "Failed to obtain Google access token\n"
      unless $response->{access_token};
    return $response->{access_token};
}

sub get_sheets {
    my (%args) = @_;
    my $response = api_request_json(
        method => 'GET',
        url    => $args{google_sheet_api} . $args{spreadsheet_id},
        bearer => $args{bearer},
    );

    my %sheetname_to_sheetid;
    for my $sheet ( @{ $response->{sheets} || [] } ) {
        my $title = $sheet->{properties}->{title};
        my $id    = $sheet->{properties}->{sheetId};
        $sheetname_to_sheetid{$title} = $id;
    }
    return \%sheetname_to_sheetid;
}

sub sheet_clear {
    my (%args) = @_;
    api_request_json(
        method => 'POST',
        url    => $args{google_sheet_api} . $args{spreadsheet_id} . ':batchUpdate',
        bearer => $args{bearer},
        payload => {
            requests => [
                {
                    updateCells => {
                        range  => { sheetId => $args{sheet_id} },
                        fields => 'userEnteredValue',
                    }
                }
            ],
        },
    );
}

sub set_column_format_to_text {
    my (%args) = @_;
    api_request_json(
        method => 'POST',
        url    => $args{google_sheet_api} . $args{spreadsheet_id} . ':batchUpdate',
        bearer => $args{bearer},
        payload => {
            requests => [
                {
                    repeatCell => {
                        range => {
                            sheetId          => $args{sheet_id},
                            startColumnIndex => $args{column_index},
                            endColumnIndex   => $args{column_index} + 1,
                        },
                        cell => {
                            userEnteredFormat => {
                                numberFormat => { type => 'TEXT' },
                            },
                        },
                        fields => 'userEnteredFormat.numberFormat',
                    }
                }
            ],
        },
    );
}

sub api_request_json {
    my (%args) = @_;
    my %headers = %{ $args{headers} || {} };
    if ( $args{bearer} ) {
        $headers{Authorization} = $args{bearer};
    }

    my $content;
    if ( $args{payload} ) {
        $headers{'content-type'} ||= 'application/json';
        $content = encode_json( $args{payload} );
    }
    elsif ( $args{form} ) {
        $content = form_urlencode( @{ $args{form} } );
    }

    my $http = HTTP::Tiny->new(
        default_headers => \%headers,
        timeout         => 60,
    );
    my $response = $http->request(
        $args{method},
        $args{url},
        defined $content ? { content => $content } : {},
    );

    die sprintf(
        "Request failed: %s %s returned %s %s\n%s\n",
        $args{method},
        $args{url},
        $response->{status} || 'unknown',
        $response->{reason} || 'unknown',
        $response->{content} || '',
      )
      unless $response->{success};

    return {} unless defined $response->{content} && length $response->{content};
    return decode_json( $response->{content} );
}

sub form_urlencode {
    my (@pairs) = @_;
    my @encoded;
    while (@pairs) {
        my $key   = shift @pairs;
        my $value = shift @pairs;
        push @encoded, uri_escape($key) . '=' . uri_escape($value);
    }
    return join '&', @encoded;
}

sub uri_escape {
    my ($value) = @_;
    $value = '' unless defined $value;
    $value =~ s/([^A-Za-z0-9\-\._~])/sprintf('%%%02X', ord($1))/ge;
    return $value;
}
