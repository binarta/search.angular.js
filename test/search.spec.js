describe('search.js', function() {
    var ctrl, $scope, rest, topics;

    beforeEach(module('binarta.search'));
    beforeEach(inject(function($rootScope, restServiceHandler, config, topicRegistryMock) {
        $scope = $rootScope.$new();
        rest = restServiceHandler;
        topics = topicRegistryMock;
        config.namespace = 'N';
        config.baseUri = 'http://host/';
    }));

    function request() {
        return rest.calls[0].args[0];
    }

    describe('BinartaSearchController', function() {
        beforeEach(inject(function($controller) {
            ctrl = $controller(BinartaSearchController, {$scope:$scope});
        }));

        describe('on init', function() {
            beforeEach(function() {
                $scope.init({
                    entity:'E',
                    context:'C',
                    filters:{customField:'F'}
                });
            });

            describe('and locale selected', function() {
                beforeEach(function() {
                    topics['i18n.locale']('en');
                });

                it('and app start selected do search', function() {
                    topics['app.start']();
                    expect(request()).toBeDefined();
                });

                it('and search do rest call', function() {
                    $scope.search();
                    expect(request().params.method).toEqual('POST');
                    expect(request().params.url).toEqual('http://host/api/query/E/C');
                    expect(request().params.data.args).toEqual({namespace:'N', customField:'F'});
                    expect(request().params.headers['Accept-Language']).toEqual('en');
                });

                it('and search with query string', function() {
                    $scope.q = 'query-string';
                    $scope.search();
                    expect(request().params.data.args.q).toEqual($scope.q);
                });

                it('and search with custom filters defined through $scope', function() {
                    $scope.filters.anotherFilter = 'X';
                    $scope.search();
                    expect(request().params.data.args.anotherFilter).toEqual('X');
                });
            });
        });
    });
});