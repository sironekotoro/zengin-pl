package Zengin::TestHelper;
use strict;
use warnings;

use Exporter 'import';
our @EXPORT_OK = qw(live_client_or_skip);

use Test::More ();
use Zengin::Pl;

sub live_client_or_skip {
    my (%args) = @_;
    my $client = Zengin::Pl->new(%args);

    eval { $client->get_all_banks(); 1 } or do {
        my $error = $@ || 'unknown error';
        Test::More::plan( skip_all => "remote dataset unavailable: $error" );
    };

    return $client;
}

1;
