use strict;
use warnings;
use Test::More;
use File::Basename qw(dirname);
use File::Spec;
use Cwd qw(abs_path);

my $repo_root = dirname( dirname( abs_path(__FILE__) ) );
my $web_root  = File::Spec->catdir( $repo_root, 'web' );
my %asset = map { $_ => File::Spec->catfile( $web_root, $_ ) } qw(
  favicon.svg
  favicon.ico
  favicon-16x16.png
  favicon-32x32.png
  apple-touch-icon.png
);

plan tests => 8;

ok( ( grep { -f $asset{$_} } keys %asset ) == scalar keys %asset,
    'favicon assets are present' );

my $html = _read_text( File::Spec->catfile( $web_root, 'index.html' ) );
like( $html, qr{<link\s+rel="icon"\s+href="favicon\.svg"\s+type="image/svg\+xml">},
    'SVG favicon is the primary icon' );
like( $html, qr{<link\s+rel="alternate icon"\s+href="favicon\.ico"\s+type="image/x-icon">},
    'ICO favicon fallback is referenced' );
like( $html, qr{<link\s+rel="apple-touch-icon"\s+href="apple-touch-icon\.png"\s+sizes="180x180">},
    'Apple touch icon is referenced' );

my $svg = _read_text( $asset{'favicon.svg'} );
like( $svg, qr{viewBox="0 0 64 64"}, 'SVG has a square viewBox' );
like( $svg, qr{#3F51B5.*#FF9F1C|#FF9F1C.*#3F51B5}s,
    'SVG uses the specified indigo and orange colors' );

is_deeply( [ _png_dimensions( $asset{'favicon-16x16.png'} ),
             _png_dimensions( $asset{'favicon-32x32.png'} ),
             _png_dimensions( $asset{'apple-touch-icon.png'} ) ],
           [ [ 16, 16 ], [ 32, 32 ], [ 180, 180 ] ],
           'PNG fallback dimensions are correct' );

is_deeply( _ico_info( $asset{'favicon.ico'} ),
           { reserved => 0, type => 1, sizes => [ 16, 32, 48 ] },
           'ICO contains 16, 32, and 48 pixel entries' );

sub _read_text {
    my ($path) = @_;
    open my $fh, '<:encoding(UTF-8)', $path or die "$path: $!";
    local $/;
    return <$fh>;
}

sub _read_binary {
    my ($path) = @_;
    open my $fh, '<:raw', $path or die "$path: $!";
    local $/;
    return <$fh>;
}

sub _png_dimensions {
    my ($path) = @_;
    my $png = _read_binary($path);
    return [] unless substr( $png, 0, 8 ) eq "\x89PNG\r\n\x1a\n";
    return [] unless substr( $png, 12, 4 ) eq 'IHDR';
    return [ unpack( 'NN', substr( $png, 16, 8 ) ) ];
}

sub _ico_info {
    my ($path) = @_;
    my $ico = _read_binary($path);
    my ( $reserved, $type, $count ) = unpack( 'vvv', substr( $ico, 0, 6 ) );
    my @sizes;
    for my $index ( 0 .. $count - 1 ) {
        my $width = unpack( 'C', substr( $ico, 6 + ( $index * 16 ), 1 ) );
        push @sizes, $width || 256;
    }
    return { reserved => $reserved, type => $type, sizes => \@sizes };
}
