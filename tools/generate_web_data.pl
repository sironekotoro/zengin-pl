#!/usr/bin/env perl
use strict;
use warnings;
use utf8;
use JSON::XS;
use HTTP::Tiny;
use File::Path qw(make_path);
use File::Basename qw(dirname);

my $BASE_URL = $ENV{ZENGIN_BASE_URL} // 'https://raw.githubusercontent.com/sironekotoro/zengin-data-mirror/main/data';
my $OUTPUT_DIR = 'web/data';
my $http = HTTP::Tiny->new(timeout => 30);

sub fetch_json {
    my ($url) = @_;
    my $res = $http->get($url);
    die "Failed to fetch $url: $res->{status} $res->{reason}" unless $res->{success};
    return decode_json($res->{content});
}

sub write_file {
    my ($path, $content) = @_;
    make_path(dirname($path));
    open my $fh, '>:raw', $path or die "Cannot open $path: $!";
    print $fh $content;
    close $fh;
}

sub main {
    make_path("$OUTPUT_DIR/branches");

    print "Fetching banks.json...\n";
    my $banks = fetch_json("$BASE_URL/banks.json");
    write_file("$OUTPUT_DIR/banks.json", encode_json($banks));
    print "  Written: $OUTPUT_DIR/banks.json (" . (scalar keys %$banks) . " banks)\n";

    print "Fetching meta info...\n";
    for my $meta_file (qw(updated_at revision)) {
        my $res = $http->get("$BASE_URL/$meta_file");
        if ($res->{success}) {
            my $value = $res->{content};
            $value =~ s/\s+\z//;
            write_file("$OUTPUT_DIR/$meta_file", $value);
            print "  Written: $OUTPUT_DIR/$meta_file\n";
        }
    }

    my @bank_codes = sort keys %$banks;
    my $total = scalar @bank_codes;
    my $count = 0;

    print "Fetching branches for $total banks...\n";
    for my $code (@bank_codes) {
        $count++;
        print "\r  Progress: $count/$total" if $count % 50 == 0 || $count == $total;

        my $url = "$BASE_URL/branches/$code.json";
        my $res = $http->get($url);
        if ($res->{success}) {
            my $branches = decode_json($res->{content});
            write_file("$OUTPUT_DIR/branches/$code.json", encode_json($branches));
        }
    }
    print "\n  Done fetching branches\n";

    print "Generating meta.json...\n";
    my $meta = {
        generated_at => time,
        source_url   => $BASE_URL,
        bank_count   => scalar keys %$banks,
    };
    write_file("$OUTPUT_DIR/meta.json", encode_json($meta));
    print "  Written: $OUTPUT_DIR/meta.json\n";

    print "Done!\n";
}

main();