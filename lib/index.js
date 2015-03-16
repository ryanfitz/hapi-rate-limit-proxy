"use strict";

var rateLimiter = require('./rateLimiter');
var Hoek        = require('hoek');
var Boom        = require('boom');
var Joi         = require('joi');
var url         = require('url');
var _           = require('lodash');

var internals = {};

exports.register = function (plugin, options, next) {
  Hoek.assert(options, 'Missing options');
  Hoek.assert(options.port, 'Missing required redis port in configuration');
  Hoek.assert(options.host, 'Missing required redis host in configuration');

  var settings = Hoek.clone(options);

  // 2 requests per second
  settings.tokensPerInterval = settings.tokensPerInterval || 2;
  settings.interval = settings.interval || 1;

  var limiter = rateLimiter(settings); // 2 requests per second

  plugin.route([
    { method: 'GET', path: '/proxy', config: internals.proxy(limiter) }
  ]);

  next();
};

exports.register.attributes = {
  pkg: require('../package.json')
};

internals.rateLimitExceeded = function (err) {
  var error = Boom.badRequest('too many requests');
  error.output.statusCode = 429;
  error.reformat();
  error.output.payload.retryable = true;
  error.output.payload.delay = err.delay;

  return error;
};

internals.parseRedirects = function (param) {
  if(_.isNull(param) || _.isUndefined(param)) {
    return 10; // default number of redirects
  }

  return param;
};

internals.proxy = function (limiter) {

  return {
    validate: {
      query: Joi.object({
        url: Joi.string().required(),
        r : [Joi.number().min(1), Joi.boolean()],
      }).options({ allowUnknown: true})
    },

    handler: function (request, reply) {
      var host = url.parse(request.query.url).host;

      limiter.consumeTokens(host, function (err) {
        if (err && err.code === 'RateLimitExceeded') {
          return reply(internals.rateLimitExceeded(err));
        }

        return reply.proxy({
          passThrough: true,
          timeout: 20000,
          uri: request.query.url,
          redirects: internals.parseRedirects(request.query.r),
          onResponse: function (err, res, request, reply, settings, ttl) {
            if (err) {
              err.output.payload.url = err.data[1].url;
              return reply(err);
            }
            return reply(res)
                  .ttl(ttl)
                  .passThrough(settings.passThrough || false);   // Default to false
          }
        });
      });
    }
  };
};
