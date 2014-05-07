angular.module('binarta.search', ['angular.usecase.adapter', 'rest.client', 'config', 'notifications'])
    .controller('BinartaSearchController', ['$scope', 'usecaseAdapterFactory', 'restServiceHandler', 'config', 'ngRegisterTopicHandler', '$location', BinartaSearchController]);

function BinartaSearchController($scope, usecaseAdapterFactory, restServiceHandler, config, ngRegisterTopicHandler, $location) {
    var request = usecaseAdapterFactory($scope);

    $scope.init = function (args) {
        new Initializer(args).execute();
    };

    function exposeSearchResultsOnScope(results) {
        incrementOffset();
        results.forEach(function (it) {
            it.remove = function () {
                results.splice(results.indexOf(it), 1);
            };
            it.update = function(args) {
                Object.keys(args).forEach(function(key) {
                    it[key] = args[key];
                });
            };
            $scope.results.push(it);
        });
    }

    function incrementOffset() {
        request.params.data.args.subset.offset += 10;
    }

    function reset() {
        $scope.results = [];
    }

    $scope.search = function () {
        reset();
        executeSearch();
    };

    function executeSearch() {
        applyCustomerFilters();
        applySearchQueryFilter();
        restServiceHandler(request);
    }

    function applyCustomerFilters() {
        Object.keys($scope.filters).reduce(function (p, c) {
            p[c] = $scope.filters[c];
            return p;
        }, request.params.data.args);
    }

    function applySearchQueryFilter() {
        request.params.data.args.q = $scope.q;
    }

    $scope.searchForMore = function () {
        executeSearch();
    };

    function Initializer(args) {
        this.execute = function () {
            exposeFiltersOnScope();
            extractSearchTextFromUrl();
            prepareRestQuery();
            withLocale($scope.search);
        };

        function exposeFiltersOnScope() {
            $scope.filters = args.filters;
        }

        function extractSearchTextFromUrl() {
            $scope.q = $location.search().q;
            $location.search('q', null);
        }

        function prepareRestQuery() {
            request.params = {
                method: 'POST',
                url: config.baseUri + 'api/query/' + args.entity + '/' + args.context,
                data: {args: {namespace: config.namespace, subset: {offset: 0, count: 10}}},
                withCredentials: true
            };
            request.success = exposeSearchResultsOnScope;
        }

        function withLocale(callback) {
            ngRegisterTopicHandler($scope, 'i18n.locale', function (locale) {
                request.params.headers = {'Accept-Language': locale};
                if (args.autosearch) ngRegisterTopicHandler($scope, 'app.start', callback);
            });
        }
    }
}

function RedirectToSearchController($scope, $location) {
    var self = this;

    $scope.init = function(args) {
        self.config = args || {};
    };

    $scope.submit = function() {
        $location.search('q', $scope.q);
        $location.path(localizedPrefix() + self.config.page);
    };

    function localizedPrefix() {
        return $scope.locale != null ? '/' + $scope.locale : ''
    }
}