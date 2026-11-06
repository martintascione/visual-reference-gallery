-- Migración 5: emisor Monotributo (CUIT 27-34876554-5, alias aridospetreos, vence 2028-11-05). Clave privada: secreto ARCA_MONO_KEY.
insert into public.arca_issuers (key, cuit, name, cert, cert_expires) values ('mono', '27348765545', 'GONZALEZ MARIA JULIA', '-----BEGIN CERTIFICATE-----
MIIDSDCCAjCgAwIBAgIIf78sDP0sOA8wDQYJKoZIhvcNAQENBQAwMzEVMBMGA1UEAwwMQ29tcHV0
YWRvcmVzMQ0wCwYDVQQKDARBRklQMQswCQYDVQQGEwJBUjAeFw0yNjExMDYxNjU4MDhaFw0yODEx
MDUxNjU4MDhaMDMxFjAUBgNVBAMMDWFyaWRvc3BldHJlb3MxGTAXBgNVBAUTEENVSVQgMjczNDg3
NjU1NDUwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCuLhLbCHihK7n/Bbg09PufrVFf
z+9MkN12h28teuBv2NJF5vwTkc3cErsj8RmRIdAouA1rqmFTId64Q2a0VLhO7rpPxhnqueMkQstn
qvt2qHZwhXrV0i1eDSZ3D7eTeeqMYdOKLNSB18GXY2wTaaX+jt2HdHyJGjkqyhBqeG1iBoHRCaaw
8oap8noWjNgBZaQutwoeXhTW5xMfzyUPbQIDaZJ+73cARQwqVcWSfTybLsq0tUduHAIjQoa3Z6d9
T4dfRWm+FPible6Nj7eWJvOXuehN+CsR8wDyfF/OzLFUUgmU1jfbDhsoUvoXk/I78+Mtc1cYQUAm
LSXtWIg/rJBbAgMBAAGjYDBeMAwGA1UdEwEB/wQCMAAwHwYDVR0jBBgwFoAUKw0vyN9h/QjJThHQ
NZMEbY5b0G4wHQYDVR0OBBYEFDwRhJcjjokafL0UZ1d4EMdbnd2mMA4GA1UdDwEB/wQEAwIF4DAN
BgkqhkiG9w0BAQ0FAAOCAQEAcfZSC55mPGwJUpRusjLBRMiXpt/qkddpRlVD70lsgDj004iVFv1F
1eRaqwHgoc4csI5JbTfy8EKa2rp9kiKgfQTUOwNLuJIUOKJEvWehnkJbg+YdWWfk80/yeTroyprR
J/ovhrwdaEAxUVAilnbOuCPCav4O12oj+CrVS/aq0ZBH3Ck8prpw6n/DqX548wQYE+KnA9xzG8K/
DLXj7psk3vG1A2G03syCgP0Ps2yqxts6clxYOHqBt1+VnasD9MHPqhUJlWpzk6KsVq3cOMwPZL7/
OTYsFNNsLTmWQuUO9NCHsWtgfSvWReVH6ePp4ylqtqne1kToKR8grhUHq7ZDtw==
-----END CERTIFICATE-----', '2028-11-05')
on conflict (key) do update set cuit = excluded.cuit, name = excluded.name, cert = excluded.cert, cert_expires = excluded.cert_expires, updated_at = now();
