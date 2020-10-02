Route = (function () {
  function Route(api, path, options, endpoints1) {
    this.api = api;
    this.path = path;
    this.options = options;
    this.endpoints = endpoints1;

    if (!this.endpoints) {
      this.endpoints = this.options;
      this.options = {};
    }
  }

  Route.prototype.addToApi = (function () {
    let availableMethods;
    availableMethods = ['get', 'post', 'put', 'patch', 'delete', 'options'];

    return function () {
      let allowedMethods, fullPath, rejectedMethods, self;
      self = this;

      if (_.contains(this.api._config.paths, this.path)) {
        throw new Error(`Cannot add a route at an existing path: ${this.path}`);
      }

      this.endpoints = _.extend(
        {
          options: this.api._config.defaultOptionsEndpoint,
        },
        this.endpoints
      );
      this._resolveEndpoints();
      this.api._config.paths.push(this.path);

      allowedMethods = _.filter(availableMethods, function (method) {
        return _.contains(_.keys(self.endpoints), method);
      });

      rejectedMethods = _.reject(availableMethods, function (method) {
        return _.contains(_.keys(self.endpoints), method);
      });

      fullPath = this.api._config.apiPath + this.path;

      _.each(allowedMethods, function (method) {
        let endpoint;
        endpoint = self.endpoints[method];

        return JsonRoutes.add(method, fullPath, function (req, res) {
          let doneFunc, endpointContext, error, responseData, responseInitiated;
          responseInitiated = false;

          doneFunc = function () {
            return (responseInitiated = true);
          };

          endpointContext = {
            request: req,
            response: res,
            done: doneFunc,
          };
          _.extend(endpointContext, endpoint);
          responseData = null;

          try {
            responseData = endpoint.action.call(endpointContext);
          } catch (_error) {
            error = _error;
            ironRouterSendErrorToResponse(error, req, res);

            return;
          }

          if (responseInitiated) {
            res.end();

            return;
          } else if (res.headersSent) {
            throw new Error(`Must call this.done() after handling endpoint response manually: ${method} ${fullPath}`);
          } else if (responseData === null || responseData === void 0) {
            throw new Error(`Cannot return null or undefined from an endpoint: ${method} ${fullPath}`);
          }

          if (responseData.body && (responseData.statusCode || responseData.headers)) {
            return self._respond(res, responseData.body, responseData.statusCode, responseData.headers);
          } else {
            return self._respond(res, responseData);
          }
        });
      });

      return _.each(rejectedMethods, function (method) {
        return JsonRoutes.add(method, fullPath, function (req, res) {
          let headers, responseData;
          responseData = {
            status: 'error',
            message: 'API endpoint does not exist',
          };
          headers = {
            Allow: allowedMethods.join(', ').toUpperCase(),
          };

          return self._respond(res, responseData, 405, headers);
        });
      });
    };
  })();

  /*
    Convert all endpoints on the given route into our expected endpoint object if it is a bare
    function

    @param {Route} route The route the endpoints belong to
   */

  Route.prototype._resolveEndpoints = function () {
    _.each(this.endpoints, function (endpoint, method, endpoints) {
      if (_.isFunction(endpoint)) {
        return (endpoints[method] = {
          action: endpoint,
        });
      }
    });
  };

  /*
    Respond to an HTTP request
   */

  Route.prototype._respond = function (response, body, statusCode, headers) {
    let defaultHeaders, delayInMilliseconds, minimumDelayInMilliseconds, randomMultiplierBetweenOneAndTwo, sendResponse;

    if (statusCode == null) {
      statusCode = 200;
    }

    if (headers == null) {
      headers = {};
    }

    defaultHeaders = this._lowerCaseKeys(this.api._config.defaultHeaders);
    headers = this._lowerCaseKeys(headers);
    headers = _.extend(defaultHeaders, headers);

    if (headers['content-type'].match(/json|javascript/) !== null) {
      if (this.api._config.prettyJson) {
        body = JSON.stringify(body, void 0, 2);
      } else {
        body = JSON.stringify(body);
      }
    }

    sendResponse = function () {
      headers['Content-Length'] = Buffer.byteLength(body);

      response.writeHead(statusCode, headers);
      response.write(body);

      return response.end();
    };

    if (statusCode === 401 || statusCode === 403) {
      minimumDelayInMilliseconds = 500;
      randomMultiplierBetweenOneAndTwo = 1 + Math.random();
      delayInMilliseconds = minimumDelayInMilliseconds * randomMultiplierBetweenOneAndTwo;

      return Meteor.setTimeout(sendResponse, delayInMilliseconds);
    } else {
      return sendResponse();
    }
  };

  /*
    Return the object with all of the keys converted to lowercase
   */

  Route.prototype._lowerCaseKeys = function (object) {
    return _.chain(object)
      .pairs()
      .map(function (attr) {
        return [attr[0].toLowerCase(), attr[1]];
      })
      .object()
      .value();
  };

  return Route;
})();

// ---
// generated by coffee-script 1.9.2
