angular.module('binarta.search', ['angular.usecase.adapter', 'rest.client', 'config', 'notifications', 'underscore'])
    .controller('BinartaSearchController', ['$scope', 'usecaseAdapterFactory', 'restServiceHandler', 'config', 'ngRegisterTopicHandler', '$location', 'topicMessageDispatcher', '$underscore', BinartaSearchController]);

function BinartaSearchController($scope, usecaseAdapterFactory, restServiceHandler, config, ngRegisterTopicHandler, $location, topicMessageDispatcher, $underscore) {
    ngRegisterTopicHandler($scope, 'end.of.page', function (it) {
        $scope.searchForMore();
    });

    $scope.$on('$routeUpdate', function() {
        exposeViewMode($location.search().viewMode);
    });

    function exposeViewMode(mode) {
        $scope.viewMode = mode;
        $location.search().viewMode = mode;
    }

    var request = usecaseAdapterFactory($scope);

    $scope.init = function (args) {
        new Initializer(args).execute();
    };

    function exposeSearchResultsOnScope(results) {
        if (results.length > 0) incrementOffset(results.length);
        results.forEach(function (it) {
            it.remove = function () {
                $scope.results.splice($scope.results.indexOf(it), 1);
            };
            it.update = function (args) {
                Object.keys(args).forEach(function (key) {
                    it[key] = args[key];
                });
            };
            $scope.results.push(it);
        });
        if ($scope.results.length > 0 && results.length == 0)
            topicMessageDispatcher.fire('system.info', {
                code: 'no.more.results.found',
                default: 'No more results found.'
            });
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
        reset();
        executeSearch();
    };

    function executeSearch() {
        applyCustomFilters();
        applySearchQueryFilter();
        restServiceHandler(request);
    }

    function applyCustomFilters() {
        if ($scope.filters) Object.keys($scope.filters).reduce(function (p, c) {
            p[c] = $scope.filters[c];
            return p;
        }, request.params.data.args);
    }

    function applySearchQueryFilter() {
        request.params.data.args.q = $scope.q;
        $location.search('q', $scope.q);
    }

    $scope.searchForMore = $underscore.debounce(function () {
        if(!$scope.working) executeSearch();
    }, 200, true);

    function Initializer(args) {
        this.execute = function () {
            exposeFiltersOnScope();
            exposeViewMode($location.search().viewMode ? $location.search().viewMode : args.viewMode);
            if (args.subset && args.subset.count) defaultSubset.count = args.subset.count;
            extractSearchTextFromUrl();
            prepareRestQuery();
            withLocale($scope.search);
        };

        function exposeFiltersOnScope() {
            $scope.filters = args.filters;
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
                    if (args.autosearch) ngRegisterTopicHandler($scope, 'app.start', callback);
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