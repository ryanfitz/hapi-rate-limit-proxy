// Load modules

var Lab   = require('lab');
var Hapi  = require('hapi');
var async = require('async');

// Test shortcuts

var expect = Lab.expect;
var before = Lab.before;
var describe = Lab.experiment;
var it = Lab.test;

describe('RateLimiterProxy', function () {

  var handler = function (request, reply) {
    reply('ok');
  };

  var upstream = new Hapi.Server(0);
  upstream.route({ method: 'GET', path: '/profile', handler: handler });

  var server = new Hapi.Server({ debug: false });

  before(function (done) {

    upstream.start(function () {

      server.pack.require('../', {host: '127.0.0.1', port: 6379}, function (err) {
        if(err) {
          return done(err);
        }

        done();
      });

    });
  });

  it('returns a reply from upstream server', function (done) {

    var link = upstream.info.uri + '/profile';
    var request = { method: 'GET', url: '/proxy?url=' + link };

    server.inject(request, function (res) {
      expect(res.statusCode).to.equal(200);
      expect(res.result).to.exist;
      expect(res.result).to.equal('ok');

      done();
    });
  });

  it('returns a reply from upstream server with query string params', function (done) {

    var link = upstream.info.uri + '/profile?cid=5678&via=top&CTARef=Homepage|CTA|smartwear';
    var request = { method: 'GET', url: '/proxy?url=' + link };

    server.inject(request, function (res) {
      expect(res.statusCode).to.equal(200);
      expect(res.result).to.exist;
      expect(res.result).to.equal('ok');

      done();
    });
  });


  it('returns a 429', function (done) {
    var link = upstream.info.uri + '/profile';
    var request = { method: 'GET', url: '/proxy?url=' + link };

    async.times(10, function(n, next){
      server.inject(request, function (res) {
        return next(null, res.statusCode);
      });
    }, function(err, codes) {
      expect(codes).eql([ 200, 429, 429, 429, 429, 429, 429, 429, 429, 429 ]);
      expect(err).to.not.exist;

      return done();
    });
  });

  it('returns all replies from upstream', {timeout: 20000}, function (done) {
    var link = upstream.info.uri + '/profile';
    var request = { method: 'GET', url: '/proxy?url=' + link };

    async.timesSeries(5, function(n, next){
      setTimeout(function () {
        server.inject(request, function (res) {
          return next(null, res.statusCode);
        });
      }, 1500);
    }, function(err, codes) {
      expect(codes).eql([ 200, 200, 200, 200, 200 ]);
      expect(err).to.not.exist;

      return done();
    });
  });
});
