angular.module('binarta.search', ['angular.usecase.adapter', 'rest.client', 'config', 'notifications'])
    .controller('BinartaSearchController', ['$scope', 'usecaseAdapterFactory', 'restServiceHandler', 'config', 'ngRegisterTopicHandler', BinartaSearchController]);

function BinartaSearchController($scope, usecaseAdapterFactory, restServiceHandler, config, ngRegisterTopicHandler) {
    var request = usecaseAdapterFactory($scope);

    $scope.init = function (args) {
        $scope.filters = args.filters;
        request.params = {
            method: 'POST',
            url: config.baseUri + 'api/query/' + args.entity + '/' + args.context,
            data: {args: {namespace: config.namespace}}
        };
        ngRegisterTopicHandler($scope, 'i18n.locale', function (locale) {
            request.params.headers = {'Accept-Language': locale};
            ngRegisterTopicHandler($scope, 'app.start', $scope.search);
        });
    };

    $scope.search = function () {
        Object.keys($scope.filters).reduce(function (p, c) {
            p[c] = $scope.filters[c];
            return p;
        }, request.params.data.args);
        request.params.data.args.q = $scope.q;
        restServiceHandler(request);
    }
}