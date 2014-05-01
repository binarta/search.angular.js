angular.module('binarta.search', ['angular.usecase.adapter', 'rest.client', 'config', 'notifications'])
    .controller('BinartaSearchController', ['$scope', 'usecaseAdapterFactory', 'restServiceHandler', 'config', 'ngRegisterTopicHandler', BinartaSearchController]);

function BinartaSearchController($scope, usecaseAdapterFactory, restServiceHandler, config, ngRegisterTopicHandler) {
    var request = usecaseAdapterFactory($scope);

    $scope.init = function (args) {
        new Initializer(args).execute();
    };

    function exposeSearchResultsOnScope(results) {
        $scope.results = results;
    }

    $scope.search = function () {
        exposeSearchResultsOnScope([]);
        applyCustomerFilters();
        applySearchQueryFilter();
        restServiceHandler(request);
    };

    function applyCustomerFilters() {
        Object.keys($scope.filters).reduce(function (p, c) {
            p[c] = $scope.filters[c];
            return p;
        }, request.params.data.args);
    }

    function applySearchQueryFilter() {
        request.params.data.args.q = $scope.q;
    }

    function Initializer(args) {
        this.execute = function() {
            exposeFiltersOnScope();
            prepareRestQuery();
            withLocale($scope.search);
        };

        function exposeFiltersOnScope() {
            $scope.filters = args.filters;
        }

        function prepareRestQuery() {
            request.params = {
                method: 'POST',
                url: config.baseUri + 'api/query/' + args.entity + '/' + args.context,
                data: {args: {namespace: config.namespace}}
            };
            request.success = exposeSearchResultsOnScope;
        }

        function withLocale(callback) {
            ngRegisterTopicHandler($scope, 'i18n.locale', function (locale) {
                request.params.headers = {'Accept-Language': locale};
                ngRegisterTopicHandler($scope, 'app.start', callback);
            });
        }
    }
}