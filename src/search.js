(function () {
    angular.module('binarta.search', ['ngRoute', 'angular.usecase.adapter', 'rest.client', 'config', 'notifications'])
        .provider('binartaEntityDecorators', BinartaEntityDecoratorsFactory)
        .factory('binartaEntityExists', ['usecaseAdapterFactory', 'config', 'restServiceHandler', BinartaEntityExistsFactory])
        .factory('binartaEntityReader', ['usecaseAdapterFactory', 'config', 'binartaEntityDecorators', 'restServiceHandler', BinartaEntityReaderFactory])
        .factory('binartaEntityEcho', ['usecaseAdapterFactory', 'config', 'restServiceHandler', BinartaEntityEchoFactory])
        .factory('binartaSearch', ['restServiceHandler', 'binartaEntityDecorators', 'config', BinartaSearchFactory])
        .controller('BinartaSearchController', ['$scope', 'usecaseAdapterFactory', 'ngRegisterTopicHandler', '$location', 'topicMessageDispatcher', 'binartaSearch', '$routeParams', BinartaSearchController])
        .controller('BinartaEntityController', ['$scope', '$location', '$routeParams', 'restServiceHandler', 'usecaseAdapterFactory', 'config', 'binartaEntityDecorators', 'binartaEntityReader', BinartaEntityController])
        .controller('RedirectToSearchController', ['$scope', '$location', '$routeParams', RedirectToSearchController])
        .config(['$routeProvider', function ($routeProvider) {
            $routeProvider
                .when('/search/:type', {templateUrl: 'partials/search/index.html', reloadOnSearch: false})
                .when('/:locale/search/:type', {templateUrl: 'partials/search/index.html', reloadOnSearch: false});
        }]);

    function BinartaSearchFactory(rest, decorators, config) {
        return function (args) {
            var decorator = decorators[args.entity + '.' + args.action + '.request'];
            var request = Object.create(args);

            request.success = function (results) {
                args.success(results.map(function (it) {
                    var decorator = decorators[args.entity + '.' + args.action];
                    return it = decorator ? decorator(it) : it;
                }));
            };
            request.params = {
                method: 'POST',
                url: config.baseUri + 'api/query/' + args.entity + '/' + args.action,
                headers: {'accept-language': args.locale},
                data: {args: {namespace: config.namespace, subset: args.subset}, locale: args.locale},
                withCredentials: true
            };
            if (args.q) request.params.data.args.q = args.q;
            if (args.mask) request.params.data.args.mask = args.mask;
            if (args.sortings) request.params.data.args.sortings = args.sortings;
            if (args.filters) {
                Object.keys(args.filters).reduce(function (p, c) {
                    p[c] = args.filters[c];
                    return p;
                }, request.params.data.args);
                if (decorator)
                    request.params.data.args = decorator(request.params.data.args)
            }

            rest(request);
        }
    }

    function BinartaSearchController($scope, usecaseAdapterFactory, ngRegisterTopicHandler, $location, topicMessageDispatcher, search, $routeParams) {
        var self = this;
        var request;

        $scope.$on('$routeUpdate', function () {
            exposeViewMode($location.search().viewMode);
        });

        function exposeViewMode(mode) {
            $scope.viewMode = mode;
            self.viewMode = mode;
            if (mode) $location.search().viewMode = mode;
        }

        $scope.searchForMoreLock = true;
        this.searchForMoreLock = true;

        $scope.init = function (args) {
            init(args, $scope);
        };
        this.init = function (args) {
            init(args, self);
        };

        function init(args, ctx) {
            request = usecaseAdapterFactory(ctx);
            self.entity = args.entity;
            self.action = args.context;
            self.noMoreResultsNotification = args.noMoreResultsNotification != false;
            ctx.decorator = args.decorator;
            ctx.filtersCustomizer = args.filtersCustomizer;
            applyRouteTypeToFilters();
            new Initializer(args, ctx).execute();

            function applyRouteTypeToFilters() {
                if (!args.filters) args.filters = {};
                if (!args.filters.type) args.filters.type = $routeParams.type;
            }
        }


        function exposeSearchResultsOnScope(results, ctx) {
            if (results.length > 0) incrementOffset(results.length);
            results.forEach(function (it) {
                it.remove = function () {
                    ctx.results.splice(ctx.results.indexOf(it), 1);
                };
                it.update = function (args) {
                    Object.keys(args).forEach(function (key) {
                        it[key] = args[key];
                    });
                };
                if (ctx.decorator) ctx.decorator(it);
                ctx.results.push(it);
            });
            if (ctx.results.length > 0 && results.length == 0) {
                if (self.noMoreResultsNotification)
                    topicMessageDispatcher.fire('system.info', {
                        code: 'no.more.results.found',
                        default: 'No more results found.'
                    });
                ctx.noMoreResults = true;
            } else {
                ctx.noMoreResults = false;
            }
            ctx.searchForMoreLock = false;
        }

        function incrementOffset(count) {
            self.subset.offset += count;
        }

        var defaultSubset = {offset: 0, count: 10};

        function reset(ctx) {
            self.subset = {offset: defaultSubset.offset, count: defaultSubset.count};
            ctx.results = [];
        }

        $scope.search = function () {
            $scope.searchForMoreLock = true;
            reset($scope);
            executeSearch($scope);
        };

        this.search = function () {
            self.searchForMoreLock = true;
            reset(self);
            executeSearch(self);
        };

        function executeSearch(ctx) {
            var applyFiltersAndSendRequest = function () {
                applySearchQueryFilter(ctx);
                var args = Object.create(request);
                args.entity = self.entity;
                args.action = self.action;
                args.subset = self.subset;
                args.locale = self.locale;
                args.mask = ctx.mask;
                args.filters = ctx.filters;
                args.sortings = ctx.sortings;
                args.q = ctx.q;
                search(args);
            };
            if (ctx.filtersCustomizer) ctx.filtersCustomizer({
                filters: ctx.filters,
                subset: self.subset
            }).then(applyFiltersAndSendRequest, applyFiltersAndSendRequest);
            else applyFiltersAndSendRequest();
        }

        function applySearchQueryFilter(ctx) {
            $location.search('q', ctx.q);
        }

        $scope.searchForMore = function () {
            if (!$scope.working && !$scope.searchForMoreLock) executeSearch($scope);
        };

        this.searchForMore = function () {
            if (!self.working && !self.searchForMoreLock) executeSearch(self);
        };

        function Initializer(args, ctx) {
            this.execute = function () {
                exposeMaskOnScope();
                exposeFiltersOnScope();
                exposeSortingsOnScope();
                exposeViewMode($location.search().viewMode ? $location.search().viewMode : args.viewMode);
                if (args.subset && args.subset.count) defaultSubset.count = args.subset.count;
                extractSearchTextFromUrl();
                prepareRestQuery(ctx);
                args.filters && args.filters.locale == 'default' ? withDefaultLocale(ctx.search) : withLocale(ctx.search);
            };

            function exposeMaskOnScope() {
                ctx.mask = args.mask;
            }

            function exposeFiltersOnScope() {
                ctx.filters = args.filters;
            }

            function exposeSortingsOnScope() {
                if (args.sortings) ctx.sortings = args.sortings;
            }

            function extractSearchTextFromUrl() {
                ctx.q = $location.search().q;
            }

            function prepareRestQuery(ctx) {
                request.success = function (results) {
                    exposeSearchResultsOnScope(results, ctx);
                }
            }

            function withLocale(callback) {
                ngRegisterTopicHandler({
                    scope: $scope,
                    topic: 'i18n.locale',
                    handler: function (locale) {
                        self.locale = locale;
                        if (args.autosearch) callback();
                    },
                    executeHandlerOnce: true
                });
            }

            function withDefaultLocale(callback) {
                self.locale = 'default';
                if (args.autosearch) callback();
            }
        }
    }

    function RedirectToSearchController($scope, $location, $routeParams) {
        var self = this;

        $scope.init = function (args) {
            self.config = args || {};
        };

        $scope.submit = function () {
            $location.search('q', $scope.q);
            $location.path(localizedPrefix() + self.config.page);
        };

        function localizedPrefix() {
            return $routeParams.locale ? '/' + $routeParams.locale : ''
        }
    }

    function BinartaEntityReaderFactory(usecaseAdapterFactory, config, binartaEntityDecorators, restServiceHandler) {
        return function (args) {
            var request = usecaseAdapterFactory(args.$scope);
            var params = args.request;
            params.namespace = config.namespace;
            params.treatInputAsId = true;

            request.params = {
                method: 'GET',
                url: config.baseUri + 'api/entity/' + args.entity,
                params: params,
                withCredentials: true
            };
            request.success = function (entity) {
                var decorator = binartaEntityDecorators[args.entity + '.view'];
                args.success(decorator ? decorator(entity) : entity);
            };
            request.notFound = args.notFound;
            restServiceHandler(request);
        }
    }

    function BinartaEntityExistsFactory(usecaseAdapterFactory, config, restServiceHandler) {
        return function (args) {
            var request = usecaseAdapterFactory(args.$scope);
            var params = args.request;
            params.namespace = config.namespace;

            request.params = {
                method: 'HEAD',
                url: config.baseUri + 'api/entity/' + args.entity,
                params: params,
                withCredentials: true
            };
            request.success = args.success;
            request.notFound = args.notFound;
            restServiceHandler(request);
        }
    }

    function BinartaEntityEchoFactory(usecaseAdapterFactory, config, restServiceHandler) {
        return function (args) {
            var request = usecaseAdapterFactory(args.$scope);
            request.params = {
                method: 'POST',
                url: config.baseUri + 'api/echo/' + args.entity,
                withCredentials: true,
                data: args.request
            };
            request.success = args.success;
            restServiceHandler(request)
        }
    }

    function BinartaEntityController($scope, $location, $routeParams, restServiceHandler, usecaseAdapterFactory, config, binartaEntityDecorators, binartaEntityReader) {
        var self = this;

        function setEntity(entity) {
            $scope[self.ctx.var || 'entity'] = entity;
        }

        function getEntity() {
            return $scope[self.ctx.var || 'entity'];
        }

        $scope.clear = function () {
            var entity = {namespace: config.namespace};
            if (self.ctx.mask) Object.keys(self.ctx.mask).reduce(function (p, c) {
                p[c] = self.ctx.mask[c];
                return p;
            }, entity);
            setEntity(entity);
        };

        function fetch(args) {
            setEntity(undefined);
            binartaEntityReader({
                $scope: $scope,
                entity: self.ctx.entity,
                request: {id: args.id},
                success: setEntity
            });
        }

        $scope.init = function (args) {
            self.ctx = args;
            $scope.refresh = function () {
                $scope.init(args)
            };
            fetch({id: self.ctx.id || $location.search()[args.queryParam] || $routeParams.id});
            if (self.ctx.queryParam) $scope.$on('$routeUpdate', function (evt, args) {
                if (args.params[self.ctx.queryParam]) fetch({id: args.params[self.ctx.queryParam]});
            });
        };

        $scope.forCreate = function (args) {
            self.ctx = args;
            $scope.clear();
        };

        function performHTTPRequest(args) {
            var decorator = binartaEntityDecorators[self.ctx.entity + '.' + args.action];
            var data = decorator ? decorator(getEntity()) : getEntity();
            data.context = args.action;
            var request = usecaseAdapterFactory($scope);
            request.params = {
                method: args.method,
                url: config.baseUri + 'api/entity/' + self.ctx.entity,
                data: data,
                withCredentials: true
            };
            request.success = function (it) {
                args.onSuccess(it);
                if (self.ctx.onSuccess) self.ctx.onSuccess();
            };
            restServiceHandler(request);
        }

        $scope.create = function () {
            performHTTPRequest({
                action:'add',
                method:'PUT',
                onSuccess:$scope.edit
            });
        };

        $scope.edit = function (args) {
            fetch({id: args.id});
        };

        $scope.update = function () {
            performHTTPRequest({
                action:'update',
                method:'POST',
                onSuccess:$scope.clear
            });
        };

        $scope.remove = function() {
            var request = usecaseAdapterFactory($scope);
            request.params = {
                method: 'DELETE',
                url: config.baseUri + 'api/entity/' + self.ctx.entity + '?id=' + encodeURIComponent(getEntity().id),
                withCredentials: true
            };
            request.success = function (it) {
                $scope.clear();
                if (self.ctx.onSuccess) self.ctx.onSuccess();
            };
            restServiceHandler(request);
        }
    }

    function BinartaEntityDecoratorsFactory() {
        var decorators = {};
        return {
            add: function (args) {
                decorators[args.entity + '.' + args.action] = args.mapper;
            },
            $get: function () {
                return decorators;
            }
        }
    }
})();