requires 'perl', '5.008001';
requires 'JSON::XS';
requires 'IO::Socket::SSL';
requires 'Mozilla::CA';

on 'test' => sub {
    requires 'Test::More', '0.98';
};
