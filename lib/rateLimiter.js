'use strict';

var _       = require('lodash'),
    redback = require('redback');

var internals = {};

internals.namespace = 'hapi-rate-limit-proxy';

internals.backoff = function (tokens, tokensPerInterval, interval) {
  var backedUp = tokens - tokensPerInterval;

  var max = Math.ceil(backedUp * interval);

  var twelveHours = 43200;
  return Math.min(max, twelveHours);
};

internals.consumeTokens = function (ratelimit, tokensPerInterval, interval, host, callback) {

  ratelimit.addCount(host, interval, function (err, consumedTokens) {
    if(err) {
      return callback(err);
    }

    if(consumedTokens > tokensPerInterval) {
      var error = new Error('Rate limit exceeded');
      error.code = 'RateLimitExceeded';
      error.retryable = true;
      error.delay = internals.backoff(consumedTokens, tokensPerInterval, interval);

      return callback(error);
    } else {
      return callback();
    }
  });
};

module.exports = function (settings) {

  var client = redback.createClient(settings.port, settings.host);
  var ratelimit = client.createRateLimit(internals.namespace, {bucket_interval : settings.interval} );

  return {
    consumeTokens : _.partial(internals.consumeTokens, ratelimit, settings.tokensPerInterval, settings.interval)
  };
};
