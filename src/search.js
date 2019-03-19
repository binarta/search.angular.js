(function () {
    angular.module('binarta.search', ['ngRoute', 'angular.usecase.adapter', 'rest.client', 'config', 'notifications', 'binarta-applicationjs-angular1'])
        .provider('binartaEntityDecorators', BinartaEntityDecoratorsFactory)
        .factory('binartaEntityExists', ['usecaseAdapterFactory', 'config', 'restServiceHandler', BinartaEntityExistsFactory])
        .factory('binartaEntityReader', ['usecaseAdapterFactory', 'config', 'binartaEntityDecorators', 'restServiceHandler', BinartaEntityReaderFactory])
        .factory('binartaEntityEcho', ['usecaseAdapterFactory', 'config', 'restServiceHandler', BinartaEntityEchoFactory])
        .factory('binartaSearch', ['restServiceHandler', 'binartaEntityDecorators', 'config', 'binarta', BinartaSearchFactory])
        .controller('BinartaSearchController', ['$scope', 'config', 'usecaseAdapterFactory', 'ngRegisterTopicHandler', '$location', 'topicMessageDispatcher', 'binartaSearch', '$routeParams', '$log', BinartaSearchController])
        .controller('BinartaEntityController', ['$scope', '$location', '$routeParams', 'restServiceHandler', 'usecaseAdapterFactory', 'config', 'binartaEntityDecorators', 'binartaEntityReader', 'topicMessageDispatcher', BinartaEntityController])
        .controller('RedirectToSearchController', ['$scope', '$location', '$routeParams', RedirectToSearchController])
        .component('binSearchWidget', new BinSearchWidget())
        .config(['$routeProvider', function ($routeProvider) {
            $routeProvider
                .when('/search/:type', {
                    templateUrl: 'bin-search-page.html',
                    controller: 'BinartaSearchController as searchCtrl',
                    reloadOnSearch: false
                })
                .when('/:locale/search/:type', {
                    templateUrl: 'bin-search-page.html',
                    controller: 'BinartaSearchController as searchCtrl',
                    reloadOnSearch: false
                });
        }]);

    function BinartaSearchFactory(rest, decorators, config, binarta) {
        return function (args) {
            binarta.schedule(function () {
                var decorator = decorators[args.entity + '.' + args.action + '.request'];
                var request = Object.create(args);

                function dropExcessResults(result) {
                    if (args.subset && args.subset.count && args.subset.count + 1 == result.results.length) {
                        result.results.splice(-1);
                        result.hasMore = true;
                    }
                }

                request.success = function (results) {
                    var result = {
                        hasMore: false,
                        results: decoratedResults(results)
                    };
                    dropExcessResults(result);
                    args.complexResult ? args.success(result) : args.success(result.results);
                };

                function decoratedResults(results) {
                    return results.map(function (it) {
                        var decorator = decorators[args.entity + '.' + args.action];
                        return decorator ? decorator(it) : it;
                    })
                }


                if (!args.locale) args.locale = getCurrentLocale();

                request.params = {
                    method: 'POST',
                    url: config.baseUri + 'api/query/' + args.entity + '/' + args.action,
                    headers: {'accept-language': args.locale},
                    data: {args: {namespace: config.namespace, subset: args.subset}, locale: args.locale},
                    withCredentials: true
                };
                if (args.includeCarouselItems) request.params.headers['X-Binarta-Carousel'] = true;
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
                if (args.subset && args.subset) request.params.data.args.subset = {
                    count: args.subset.count + 1,
                    offset: args.subset.offset
                };

                rest(request);

                function getCurrentLocale() {
                    return binarta.application.localeForPresentation() || binarta.application.locale();
                }
            });
        }
    }

    function BinartaSearchController($scope, config, usecaseAdapterFactory, ngRegisterTopicHandler, $location, topicMessageDispatcher, search, $routeParams, $log) {
        var $ctrl = this;
        var request;

        $ctrl.templateUrl = 'bin-search-page-default.html';
        if (!config.BinSearchCatalogPage || !config.BinSearchCatalogPage.useLibraryTemplate) {
            $ctrl.templateUrl = 'partials/search/index.html';
            $log.warn('@Deprecated - BinSearchCatalogPage.templateUrl = \"' + $ctrl.templateUrl + '\"! Set config.BinSearchCatalogPage.useDefaultTemplate = true to remedy!');
        }
        if (config.BinSearchCatalogPage) {
            if (config.BinSearchCatalogPage.templateUrl)
                $ctrl.templateUrl = config.BinSearchCatalogPage.templateUrl;
        }

        $scope.$on('$routeUpdate', function () {
            exposeViewMode($location.search().viewMode);
        });

        function exposeViewMode(mode) {
            $scope.viewMode = mode;
            $ctrl.viewMode = mode;
            if (mode) $location.search().viewMode = mode;
        }

        $scope.searchForMoreLock = true;
        this.searchForMoreLock = true;

        $scope.init = function (args) {
            init(args, $scope);
        };
        this.init = function (args) {
            init(args, $ctrl);
        };

        function init(args, ctx) {
            applySearchSettings();
            request = usecaseAdapterFactory(ctx);
            request.includeCarouselItems = args.includeCarouselItems;
            $ctrl.entity = args.entity;
            $ctrl.action = args.context;
            $ctrl.noMoreResultsNotification = args.noMoreResultsNotification != false;
            ctx.decorator = args.decorator;
            ctx.filtersCustomizer = args.filtersCustomizer;
            $ctrl.onRender = args.onRender;
            applyRouteTypeToFilters();
            $scope.$on('$destroy', function () {
                if (args.onDestroy) $scope.$eval(args.onDestroy, {results: ctx.results});
            });
            new Initializer(args, ctx).execute();

            function applySearchSettings() {
                if (args.settings && config.searchSettings && config.searchSettings[args.settings]) {
                    var template = angular.copy(config.searchSettings[args.settings]);
                    if (template.filters) {
                        args.filters = angular.extend(template.filters, args.filters);
                    }
                    args = angular.extend(template, args);
                }
            }

            function applyRouteTypeToFilters() {
                if (!args.filters) args.filters = {};
                if (!args.filters.type) args.filters.type = $routeParams.type;
            }
        }

        function exposeSearchResultsOnScope(result, ctx) {
            var results = result.results;
            if (!ctx.results) ctx.results = [];
            if (results.length > 0) incrementOffset(results.length);
            ctx.hasMoreResults = result.hasMore;
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
            if ($ctrl.onRender) $scope.$eval($ctrl.onRender, {results: results});
            if (ctx.results.length > 0 && results.length == 0) {
                if ($ctrl.noMoreResultsNotification)
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
            $ctrl.subset.offset += count;
        }

        var defaultSubset = {offset: 0, count: 10};

        function reset(ctx) {
            $ctrl.subset = {offset: defaultSubset.offset, count: defaultSubset.count};
            ctx.results = undefined;
        }

        $scope.search = function () {
            $scope.searchForMoreLock = true;
            reset($scope);
            executeSearch($scope);
        };

        this.search = function () {
            $ctrl.searchForMoreLock = true;
            reset($ctrl);
            executeSearch($ctrl);
        };

        function executeSearch(ctx) {
            var applyFiltersAndSendRequest = function () {
                applySearchQueryFilter(ctx);
                var args = Object.create(request);
                args.entity = $ctrl.entity;
                args.action = $ctrl.action;
                args.subset = getSubset();
                args.locale = $ctrl.locale;
                args.mask = ctx.mask;
                args.filters = ctx.filters;
                args.sortings = ctx.sortings;
                args.q = ctx.q;
                args.complexResult = true;
                search(args);
            };
            if (ctx.filtersCustomizer) ctx.filtersCustomizer({
                filters: ctx.filters,
                subset: getSubset()
            }).then(applyFiltersAndSendRequest, applyFiltersAndSendRequest);
            else applyFiltersAndSendRequest();
        }

        function applySearchQueryFilter(ctx) {
            $location.search('q', ctx.q);
        }

        function getSubset() {
            return {
                offset: $ctrl.subset.offset,
                count: $ctrl.subset.count
            }
        }

        $scope.searchForMore = function () {
            if (!$scope.working && !$scope.searchForMoreLock) executeSearch($scope);
        };

        this.searchForMore = function () {
            if (!$ctrl.working && !$ctrl.searchForMoreLock) executeSearch($ctrl);
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
                        $ctrl.locale = locale;
                        if (args.autosearch) callback();
                    },
                    executeHandlerOnce: true
                });
            }

            function withDefaultLocale(callback) {
                $ctrl.locale = 'default';
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

    function BinSearchWidget() {
        this.templateUrl = 'bin-search-widget.html';
        this.bindings = {
            searchMode: '@'
        };
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

    function BinartaEntityController($scope, $location, $routeParams, restServiceHandler, usecaseAdapterFactory, config, binartaEntityDecorators, binartaEntityReader, topicMessageDispatcher) {
        var self = this;

        function setEntity(entity) {
            $scope[self.ctx.var || 'entity'] = entity;
            topicMessageDispatcher.fire('binarta.entity.loaded', entity);
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
                request: args,
                success: setEntity
            });
        }

        $scope.init = function (args) {
            self.ctx = args;
            $scope.refresh = function () {
                $scope.init(args)
            };
            var queryParams = {};
            queryParams[args.redirectIdToField || 'id'] = self.ctx.id || $location.search()[args.queryParam] || $routeParams.id;
            if (args.namedQuery) queryParams.context = args.namedQuery;
            fetch(queryParams);
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
                action: 'add',
                method: 'PUT',
                onSuccess: $scope.edit
            });
        };

        $scope.edit = function (args) {
            fetch({id: args.id});
        };

        $scope.update = function () {
            performHTTPRequest({
                action: 'update',
                method: 'POST',
                onSuccess: $scope.clear
            });
        };

        $scope.remove = function () {
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