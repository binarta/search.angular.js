angular.module('binarta.search', ['angular.usecase.adapter', 'rest.client', 'config', 'notifications'])
    .provider('binartaEntityDecorators', BinartaEntityDecoratorsFactory)
    .factory('binartaEntityExists', ['usecaseAdapterFactory', 'config', 'restServiceHandler', BinartaEntityExistsFactory])
    .factory('binartaEntityReader', ['usecaseAdapterFactory', 'config', 'binartaEntityDecorators', 'restServiceHandler', BinartaEntityReaderFactory])
    .controller('BinartaSearchController', ['$scope', 'usecaseAdapterFactory', 'restServiceHandler', 'config', 'ngRegisterTopicHandler', '$location', 'topicMessageDispatcher', 'binartaEntityDecorators', BinartaSearchController])
    .controller('BinartaEntityController', ['$scope', '$location', '$routeParams', 'restServiceHandler', 'usecaseAdapterFactory', 'config', 'binartaEntityDecorators', 'binartaEntityReader', BinartaEntityController]);

function BinartaSearchController($scope, usecaseAdapterFactory, restServiceHandler, config, ngRegisterTopicHandler, $location, topicMessageDispatcher, binartaEntityDecorators) {
    var self = this;

    $scope.$on('$routeUpdate', function () {
        exposeViewMode($location.search().viewMode);
    });

    function exposeViewMode(mode) {
        $scope.viewMode = mode;
        if (mode) $location.search().viewMode = mode;
    }

    var request = usecaseAdapterFactory($scope);

    $scope.searchForMoreLock = true;

    $scope.init = function (args) {
        self.entity = args.entity;
        self.action = args.context;
        $scope.decorator = args.decorator;
        $scope.filtersCustomizer = args.filtersCustomizer;
        new Initializer(args).execute();
    };

    function exposeSearchResultsOnScope(results) {
        if (results.length > 0) incrementOffset(results.length);
        results.forEach(function (it) {
            var decorator = binartaEntityDecorators[self.entity + '.' + self.action];
            it = decorator ? decorator(it) : it;
            it.remove = function () {
                $scope.results.splice($scope.results.indexOf(it), 1);
            };
            it.update = function (args) {
                Object.keys(args).forEach(function (key) {
                    it[key] = args[key];
                });
            };
            if ($scope.decorator) $scope.decorator(it);
            $scope.results.push(it);
        });
        if ($scope.results.length > 0 && results.length == 0)
            topicMessageDispatcher.fire('system.info', {
                code: 'no.more.results.found',
                default: 'No more results found.'
            });
        $scope.searchForMoreLock = false;
    }

    function incrementOffset(count) {
        request.params.data.args.subset.offset += count;
    }

    var defaultSubset = {offset: 0, count: 10};

    function reset() {
        request.params.data.args.subset = {offset: defaultSubset.offset, count: defaultSubset.count};
        $scope.results = [];
    }

    $scope.search = function () {
        $scope.searchForMoreLock = true;
        reset();
        executeSearch();
    };

    function executeSearch() {
        var applyFiltersAndSendRequest = function () {
            applyCustomMask();
            applyCustomFilters();
            applyCustomSortings();
            applySearchQueryFilter();
            restServiceHandler(request);
        };
        if ($scope.filtersCustomizer) $scope.filtersCustomizer({
            filters: $scope.filters,
            subset: request.params.data.args.subset
        }).then(applyFiltersAndSendRequest, applyFiltersAndSendRequest);
        else applyFiltersAndSendRequest();
    }

    function applyCustomMask() {
        if ($scope.mask) request.params.data.args.mask = $scope.mask;
    }

    function applyCustomFilters() {
        var decorator = binartaEntityDecorators[self.entity + '.' + self.action + '.request'];
        if ($scope.filters) {
            Object.keys($scope.filters).reduce(function (p, c) {
                p[c] = $scope.filters[c];
                return p;
            }, request.params.data.args);
            if (decorator)
                request.params.data.args = decorator(request.params.data.args)
        }
    }

    function applyCustomSortings() {
        if ($scope.sortings) request.params.data.args.sortings = $scope.sortings;
    }

    function applySearchQueryFilter() {
        request.params.data.args.q = $scope.q;
        $location.search('q', $scope.q);
    }

    $scope.searchForMore = function () {
        if (!$scope.working && !$scope.searchForMoreLock) executeSearch();
    };

    function Initializer(args) {
        this.execute = function () {
            exposeMaskOnScope();
            exposeFiltersOnScope();
            exposeSortingsOnScope();
            exposeViewMode($location.search().viewMode ? $location.search().viewMode : args.viewMode);
            if (args.subset && args.subset.count) defaultSubset.count = args.subset.count;
            extractSearchTextFromUrl();
            prepareRestQuery();
            withLocale($scope.search);
        };

        function exposeMaskOnScope() {
            $scope.mask = args.mask;
        }

        function exposeFiltersOnScope() {
            $scope.filters = args.filters;
        }

        function exposeSortingsOnScope() {
            if (args.sortings) $scope.sortings = args.sortings;
        }

        function extractSearchTextFromUrl() {
            $scope.q = $location.search().q;
        }

        function prepareRestQuery() {
            request.params = {
                method: 'POST',
                url: config.baseUri + 'api/query/' + args.entity + '/' + args.context,
                data: {args: {namespace: config.namespace}},
                withCredentials: true
            };
            request.success = exposeSearchResultsOnScope;
        }

        function withLocale(callback) {
            ngRegisterTopicHandler({
                scope: $scope,
                topic: 'i18n.locale',
                handler: function (locale) {
                    request.params.headers = {'Accept-Language': locale};
                    if (args.autosearch) callback();
                },
                executeHandlerOnce: true
            });
        }
    }
}

function RedirectToSearchController($scope, $location) {
    var self = this;

    $scope.init = function (args) {
        self.config = args || {};
    };

    $scope.submit = function () {
        $location.search('q', $scope.q);
        $location.path(localizedPrefix() + self.config.page);
    };

    function localizedPrefix() {
        return $scope.locale != null ? '/' + $scope.locale : ''
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
    return function(args) {
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

    $scope.create = function () {
        var decorator = binartaEntityDecorators[self.ctx.entity + '.add'];
        var request = usecaseAdapterFactory($scope);
        request.params = {
            method: 'PUT',
            url: config.baseUri + 'api/entity/' + self.ctx.entity,
            data: decorator ? decorator(getEntity()) : getEntity(),
            withCredentials: true
        };
        request.success = function (it) {
            $scope.edit(it);
            if (self.ctx.onSuccess) self.ctx.onSuccess();
        };
        restServiceHandler(request);
    };

    $scope.edit = function (args) {
        fetch({id: args.id});
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
