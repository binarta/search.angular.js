describe('search.js', function () {
    var ctrl, $scope, rest, topics, dispatcher, $routeParams;

    beforeEach(module('binarta.search'));
    beforeEach(module('test.app'));
    beforeEach(inject(function ($rootScope, restServiceHandler, config, topicRegistryMock, topicMessageDispatcherMock) {
        $scope = $rootScope.$new();
        $routeParams = {};
        rest = restServiceHandler;
        topics = topicRegistryMock;
        dispatcher = topicMessageDispatcherMock;
        config.namespace = 'N';
        config.baseUri = 'http://host/';
    }));

    function request(idx) {
        if (!idx) idx = 0;
        return rest.calls[idx].args[0];
    }

    describe('binartaSearch', function () {
        var search;
        beforeEach(inject(function (binartaSearch) {
            search = binartaSearch;
        }));

        it('apply projection mask to query', function () {
            search({mask: 'mask'});
            expect(request().params.data.args.mask).toEqual('mask');
        });

        it('and search do rest call', function () {
            search({
                entity: 'E',
                action: 'C',
                filters: {customField: 'F'},
                subset: {offset: 0, count: 10},
                locale: 'en'
            });
            expect(request().params.method).toEqual('POST');
            expect(request().params.url).toEqual('http://host/api/query/E/C');
            expect(request().params.data.args).toEqual({
                namespace: 'N',
                customField: 'F',
                subset: {offset: 0, count: 10}
            });
            expect(request().params.data.locale).toEqual('en');
            expect(request().params.headers['accept-language']).toEqual('en');
            expect(request().params.withCredentials).toBeTruthy();
        });

        it('and search with query string', function () {
            search({q: 'query-string'});
            expect(request().params.data.args.q).toEqual('query-string');
        });

        describe('and with search results', function () {
            var expected, actual, success;

            beforeEach(function () {
                expected = [
                    {name: 'item-1'}
                ];

                success = function (it) {
                    actual = it;
                };
                search({success: success});
                request().success(expected);
            });

            it('exposed on scope', function () {
                expect(actual).toEqual(expected);
            });

            it('results can be decorated with decorator provider', function () {
                search({entity: 'decorated-entity', action: 'view', success: success});
                request(1).success([
                    {msg: 'result'}
                ]);
                expect(actual[0].msg).toEqual('result');
                expect(actual[0].decoratedMsg).toEqual('decorated result');
            });
        });

        it('filters can be decorated with the decorators provider', function () {
            search({entity: 'decorated-entity', action: 'action', filters: {field: 'msg'}});
            expect(request().params.data.args.field).toEqual('decorated msg');
        });
    });

    describe('BinartaSearchController', function () {
        beforeEach(inject(function ($controller) {
            ctrl = $controller('BinartaSearchController', {$scope: $scope});
        }));

        describe('on init', function () {
            it('apply projection mask to query', function () {
                $scope.init({mask: 'mask'});
                $scope.search();
                expect(request().params.data.args.mask).toEqual('mask');
            });

            describe('without autosearch', function () {
                beforeEach(function () {
                    $scope.init({
                        entity: 'E',
                        context: 'C',
                        filters: {customField: 'F'}
                    });
                });

                it('and query parameter is provided', inject(function ($location) {
                    $location.search('q', 'text');
                    $scope.init({});
                    expect($scope.q).toEqual('text');
                }));

                describe('and locale selected', function () {
                    beforeEach(function () {
                        topics['i18n.locale']('en');
                    });

                    it('no events are registered with app.start', inject(function () {
                        expect(topics['app.start']).toBeUndefined();
                    }));
                });

                describe('when calling search for more before search', function () {
                    it('then no request is sent', function () {
                        $scope.searchForMore();
                        expect(rest.calls[0]).toBeUndefined();
                    });

                    describe('and search and search more are called', function () {
                        beforeEach(function () {
                            $scope.search();
                            request().success(['R']);
                            rest.reset();
                            $scope.searchForMore();
                        });

                        it('then search for more was called', function () {
                            expect(request()).toBeDefined();
                        });

                        describe('and search is called again', function () {
                            beforeEach(function () {
                                request().success([]);
                                $scope.search();
                            });

                            describe('and before response we call search more', function () {
                                beforeEach(function () {
                                    rest.reset();
                                    $scope.searchForMore();
                                });

                                it('then search for more is not executed', function () {
                                    expect(rest.calls[0]).toBeUndefined();
                                })
                            });
                        })
                    });
                })
            });

            describe('with autosearch', function () {
                beforeEach(function () {
                    $scope.init({
                        entity: 'E',
                        context: 'C',
                        filters: {customField: 'F'},
                        autosearch: true,
                        decorator: function (it) {
                            it.decorated = true;
                        }
                    });
                });

                describe('and locale selected', function () {
                    beforeEach(function () {
                        topics['i18n.locale']('en');
                    });

                    it('and search do rest call', function () {
                        expect(request().params.method).toEqual('POST');
                        expect(request().params.url).toEqual('http://host/api/query/E/C');
                        expect(request().params.data.args).toEqual({
                            namespace: 'N',
                            customField: 'F',
                            subset: {offset: 0, count: 10}
                        });
                        expect(request().params.headers['accept-language']).toEqual('en');
                        expect(request().params.withCredentials).toBeTruthy();
                    });

                    it('locale param should be on data', function () {
                        expect(request().params.data.locale).toEqual('en');
                    });

                    it('and search with query string', inject(function ($location) {
                        $scope.q = 'query-string';
                        $scope.search();
                        expect(request(1).params.data.args.q).toEqual($scope.q);
                        expect($location.search()).toEqual({q: 'query-string'});
                    }));

                    it('and search with custom filters defined through $scope', function () {
                        $scope.filters.anotherFilter = 'X';
                        $scope.search();
                        expect(request(1).params.data.args.anotherFilter).toEqual('X');
                    });

                    describe('with filters customizer', function () {
                        var success;

                        beforeEach(function () {
                            topics = {};
                            success = true;
                            rest.reset();
                            $scope.init({
                                entity: 'E',
                                context: 'C',
                                filters: {customField: 'F'},
                                filtersCustomizer: function (args) {
                                    args.filters.customized = true;
                                    args.filters.offset = args.subset.offset;
                                    args.filters.count = args.subset.count;
                                    return {
                                        then: function (s, e) {
                                            success ? s() : e();
                                        }
                                    }
                                }
                            });
                        });

                        it('with customizer success', function () {
                            $scope.search();
                            expect(request().params.data.args.customized).toBeTruthy();
                            expect(request().params.data.args.count).toEqual(request().params.data.args.subset.count);
                            expect(request().params.data.args.offset).toEqual(request().params.data.args.subset.offset);
                        });

                        it('with customizer failure', function () {
                            success = false;
                            $scope.search();
                            expect(request().params.data.args.customized).toBeTruthy();
                        })
                    });

                    describe('and when only use the default locale', function () {
                        beforeEach(function () {
                            $scope.init({
                                entity: 'E',
                                context: 'C',
                                autosearch: true,
                                filters: {
                                    locale: 'default'
                                }
                            });
                        });

                        it('accept default locale', function () {
                            expect(request(1).params.headers['accept-language']).toEqual('default');
                        });

                        it('default locale param is on data', function () {
                            expect(request(1).params.data.locale).toEqual('default');
                        });
                    });

                    describe('and with search results', function () {
                        var results;

                        beforeEach(function () {
                            results = [
                                {name: 'item-1'}
                            ];

                            request().success(results);
                        });

                        it('exposed on scope', function () {
                            expect($scope.results).toEqual(results);
                        });

                        it('subsequent searches reset results', function () {
                            $scope.search();
                            expect($scope.results).toEqual([]);
                        });

                        it('search results can be removed from the view', function () {
                            results[0].remove();
                            expect($scope.results).toEqual([]);
                        });

                        it('search results can be updated', inject(function () {
                            results[0].update({name: 'item-1-alt'});
                            expect(results[0].name).toEqual('item-1-alt');
                        }));

                        it('results can be decorated with decorator on parent scope', function () {
                            expect(results[0].decorated).toBeTruthy();
                        });

                        it('results can be decorated with decorator provider', function () {
                            $scope.init({entity: 'decorated-entity', context: 'view'});
                            $scope.search();
                            request(1).success([
                                {msg: 'result'}
                            ]);
                            expect($scope.results[0].msg).toEqual('result');
                            expect($scope.results[0].decoratedMsg).toEqual('decorated result');
                        });

                        describe('when searching for more', function () {
                            beforeEach(function () {
                                rest.reset();
                                $scope.searchForMore();
                            });

                            it('increment offset with count', function () {
                                expect(request().params.data.args.subset).toEqual({offset: 1, count: 10});
                            });

                            it('new searches reset the offset', function () {
                                $scope.search();
                                expect(request(1).params.data.args.subset).toEqual({offset: 0, count: 10});
                            });

                            describe('and more results found', function () {
                                beforeEach(function () {
                                    request().success(results);
                                });

                                it('append to search results', function () {
                                    expect($scope.results.length).toEqual(2);
                                });

                                describe('and searching for more', function () {
                                    beforeEach(function () {
                                        rest.reset();
                                        $scope.searchForMore();
                                    });

                                    it('increment offset with count', function () {
                                        expect(request().params.data.args.subset).toEqual({offset: 2, count: 10});
                                    });
                                });
                            });

                            describe('and searching for more', function () {
                                beforeEach(function () {
                                    request().success([]);
                                    rest.reset();
                                });

                                it('increment offset with count', function () {
                                    $scope.searchForMore();
                                    expect(request().params.data.args.subset).toEqual({offset: 1, count: 10});
                                });

                                it('only search for more when not working', function () {
                                    $scope.working = true;
                                    $scope.searchForMore();
                                    expect(rest.calls[0]).toBeUndefined();
                                });
                            });

                            describe('when no more are found', function () {
                                beforeEach(function () {
                                    request().success([]);
                                });

                                it('send notification', function () {
                                    expect(dispatcher['system.info']).toEqual({
                                        code: 'no.more.results.found',
                                        default: 'No more results found.'
                                    });
                                });
                            });

                            describe('when no items on scope', function () {
                                beforeEach(function () {
                                    $scope.results = [];
                                    request().success([]);
                                });

                                it('no notification sent', function () {
                                    expect(dispatcher['system.info']).toBeUndefined();
                                });
                            });
                        });
                    });
                });
            });

            it('do not subscribe for end of page events when not enabled', function () {
                $scope.init({});
                expect(topics['end.of.page']).toBeUndefined();
            });

            it('a custom page size can be specified on init', function () {
                $scope.init({subset: {count: 5}});
                $scope.search();
                expect(request().params.data.args).toEqual({namespace: 'N', subset: {offset: 0, count: 5}});
            });

            it('a custom sorting can be specified on init', function () {
                $scope.init({
                    sortings: [
                        {on: 'field', orientation: 'asc'}
                    ]
                });
                $scope.search();
                expect(request().params.data.args.sortings).toEqual([
                    {on: 'field', orientation: 'asc'}
                ]);
            });

            it('on init filters can be decorated with the decorators provider', function () {
                $scope.init({entity: 'decorated-entity', context: 'action', filters: {field: 'msg'}});
                $scope.search();
                expect(request().params.data.args.field).toEqual('decorated msg');
            });

            it('decorating on init filters does not affect source', function () {
                $scope.init({entity: 'decorated-entity', context: 'action', filters: {field: 'msg'}});
                $scope.search();
                expect($scope.filters.field).toEqual('msg');
            });

            it('when route params provides type and no type is passed to init then configure tpe', inject(function($routeParams) {
                $routeParams.type = 'type';
                $scope.init({});
                $scope.search();
                expect(request().params.data.args.type).toEqual('type');
            }));

            it('when init receives type do not override it with route params', inject(function($routeParams) {
                $routeParams.type = 'type';
                $scope.init({filters:{type:'original'}});
                $scope.search();
                expect(request().params.data.args.type).toEqual('original');
            }));

            describe('view mode', function () {
                it('defaults to undefined', inject(function ($location) {
                    $scope.init({});
                    expect($scope.viewMode).toBeUndefined();
                    expect($location.search().viewMode).toBeUndefined();
                }));

                it('can be specified and exposed on scope', inject(function ($location) {
                    $scope.init({viewMode: 'x'});
                    expect($scope.viewMode).toEqual('x');
                    expect($location.search().viewMode).toEqual('x');
                }));

                it('view mode specified on $location overrides init', inject(function ($location) {
                    $location.search().viewMode = 'x';
                    $scope.init({viewMode: 'y'});
                    expect($scope.viewMode).toEqual('x');
                    expect($location.search().viewMode).toEqual('x');
                }));

                it('on $routeUpdate adjust view mode on $scope', inject(function ($location) {
                    $scope.init({viewMode: 'x'});
                    $location.search().viewMode = 'y';
                    $scope.$broadcast('$routeUpdate');
                    expect($scope.viewMode).toEqual('y');
                    expect($location.search().viewMode).toEqual('y');
                }));
            });
        });
    });

    describe('RedirectToSearchController', function () {
        beforeEach(inject(function ($controller) {
            ctrl = $controller('RedirectToSearchController', {$scope: $scope});
        }));

        describe('on init', function () {
            beforeEach(function () {
                $scope.init({page: '/page/'});
            });

            describe('and submit', function () {
                beforeEach(function () {
                    $scope.q = 'text';
                    $scope.locale = 'locale';
                    $scope.submit();
                });

                it('then redirect to configured path with embedded query string', inject(function ($location) {
                    expect($location.search().q).toEqual($scope.q);
                    expect($location.path()).toEqual('/locale/page/');
                }));

                describe('without locale', function () {
                    beforeEach(function () {
                        $scope.locale = undefined;
                    });

                    it('test', inject(function ($location) {
                        $scope.submit();
                        expect($location.path()).toEqual('/page/');
                    }));
                });
            });
        });
    });

    describe('BinartaEntityController', function () {
        beforeEach(inject(function ($controller) {
            ctrl = $controller('BinartaEntityController', {$scope: $scope, $routeParams: $routeParams});
        }));

        describe('given id', function () {
            beforeEach(function () {
                $routeParams.id = 'id';
            });

            describe('on init with custom id', function () {
                beforeEach(function () {
                    $scope.init({
                        entity: 'E',
                        id: 'custom-id'
                    });
                });

                it('fetch entity from server', function () {
                    expect(request().params.params).toEqual({namespace: 'N', id: 'custom-id', treatInputAsId: true});
                });
            });

            describe('on init with query param', function () {
                beforeEach(inject(function ($location) {
                    $location.search({id: 'search-id'});
                    $scope.init({
                        entity: 'E',
                        queryParam: 'id'
                    })
                }));

                it('fetch entity from server', function () {
                    expect(request().params.params).toEqual({namespace: 'N', id: 'search-id', treatInputAsId: true});
                });

                describe('on route update', function () {
                    beforeEach(function () {
                        request().success('result');
                        $scope.$broadcast('$routeUpdate', {params: {id: 'changed-id'}});
                    });

                    it('reset existing entity', function () {
                        expect($scope.entity).toEqual(undefined);
                    });

                    it('reload entity from server', function () {
                        expect(request(1).params.params).toEqual({
                            namespace: 'N',
                            id: 'changed-id',
                            treatInputAsId: true
                        });
                    });
                });

                it('when query param is undefined do nothin on route update', inject(function ($location) {
                    request().success('result');
                    $scope.$broadcast('$routeUpdate', {params: {}});
                    expect($scope.entity).toEqual('result');
                    expect(rest.calls[1]).toBeUndefined();
                }));
            });

            describe('on init', function () {
                beforeEach(function () {
                    $scope.init({
                        entity: 'E'
                    });
                });

                it('fetch entity from server', function () {
                    expect(request().params.method).toEqual('GET');
                    expect(request().params.url).toEqual('http://host/api/entity/E');
                    expect(request().params.params).toEqual({namespace: 'N', id: 'id', treatInputAsId: true});
                    expect(request().params.withCredentials).toBeTruthy();
                });

                it('expose entity on scope', function () {
                    request().success('result');
                    expect($scope.entity).toEqual('result');
                });

                describe('and refresh', function () {
                    beforeEach(function () {
                        $scope.refresh();
                    });

                    it('fetch entity from server', function () {
                        expect(request().params.method).toEqual('GET');
                        expect(request().params.url).toEqual('http://host/api/entity/E');
                        expect(request().params.params).toEqual({namespace: 'N', id: 'id', treatInputAsId: true});
                        expect(request().params.withCredentials).toBeTruthy();
                    });

                    it('expose entity on scope', function () {
                        request().success('result');
                        expect($scope.entity).toEqual('result');
                    });
                });

                describe('on route update', function () {
                    beforeEach(function () {
                        request().success('result');
                        $scope.$broadcast('$routeUpdate', {params: {id: 'changed-id'}});
                    });

                    it('do nothing', function () {
                        expect($scope.entity).toEqual('result');
                        expect(rest.calls[1]).toBeUndefined();
                    });
                })
            });

            it('named entity variable', function () {
                $scope.init({var: 'custom'});
                request().success('result');
                expect($scope.custom).toEqual('result');
            });

            it('decorate entity', function () {
                $scope.init({entity: 'decorated-entity'});
                request().success({msg: 'result'});
                expect($scope.entity.msg).toEqual('result');
                expect($scope.entity.decoratedMsg).toEqual('decorated result');
            });
        });

        describe('for create', function () {
            beforeEach(function () {
                $scope.forCreate({entity: 'E'});
            });

            it('exposes entity on scope', function () {
                $scope.forCreate({});
                expect($scope.entity).toEqual({namespace: 'N'});
            });

            it('on clear resets scoped entity', function () {
                $scope.entity.field = 'value';
                $scope.clear();
                expect($scope.entity).toEqual({namespace: 'N'});
            });

            describe('on submit', function () {
                beforeEach(function () {
                    $scope.create();
                });

                it('and submit', function () {
                    expect(request().params.method).toEqual('PUT');
                    expect(request().params.url).toEqual('http://host/api/entity/E');
                    expect(request().params.data).toEqual({namespace: 'N'});
                    expect(request().params.withCredentials).toBeTruthy();
                });

                it('and success', function () {
                    request().success({id: 'id'});
                    expect(request(1).params.method).toEqual('GET');
                    expect(request(1).params.params).toEqual({namespace: 'N', id: 'id', treatInputAsId: true});
                });
            });

            describe('on edit', function () {
                beforeEach(function () {
                    $scope.entity.field = 'value';
                    $scope.edit({id: 'id'});
                });

                it('expose entity', function () {
                    request().success({id: 'id'});
                    expect($scope.entity).toEqual({id: 'id'});
                });

                it('lookup entity', function () {
                    expect(request().params.method).toEqual('GET');
                    expect(request().params.url).toEqual('http://host/api/entity/E');
                    expect(request().params.params).toEqual({namespace: 'N', id: 'id', treatInputAsId: true});
                    expect(request().params.withCredentials).toBeTruthy();
                });
            });
        });

        it('create with mask', function () {
            $scope.forCreate({mask: {field: 'value'}});
            $scope.create();
            expect(request().params.data).toEqual({namespace: 'N', field: 'value'});
        });

        describe('for create with var', function () {
            beforeEach(function () {
                $scope.forCreate({var: 'v'});
            });

            it('exposes entity on scope', function () {
                expect($scope.v).toEqual({namespace: 'N'});
            });

            it('and submit', function () {
                $scope.create();
                expect(request().params.data).toEqual({namespace: 'N'});
            });
        });

        it('create with on success handler', function () {
            var executed = false;
            $scope.forCreate({
                onSuccess: function () {
                    executed = true;
                }
            });
            $scope.create();
            request().success({});
            expect(executed).toEqual(true);
        });
    });

    describe('binarta entity reader', function () {
        var reader, args, response;

        beforeEach(inject(function (binartaEntityReader) {
            reader = binartaEntityReader;
            args = {request: {}};
            args.$scope = $scope;
            args.success = function (it) {
                response = it;
            }
            args.notFound = function () {
                response = 'not-found';
            }
        }));

        function read() {
            return reader(args);
        }

        describe('given id', function () {
            beforeEach(function () {
                args.request.id = 'id';
            });

            describe('then', function () {
                beforeEach(function () {
                    args.entity = 'E';
                    args.request.id = 'custom-id';
                    read();
                });

                it('fetch entity from server', function () {
                    expect(request().params.params).toEqual({namespace: 'N', id: 'custom-id', treatInputAsId: true});
                });
            });

            it('decorate entity', function () {
                args.entity = 'decorated-entity';
                read();
                request().success({msg: 'result'});
                expect(response.msg).toEqual('result');
                expect(response.decoratedMsg).toEqual('decorated result');
            });

            it('not exists', function () {
                read();
                request().notFound();
                expect(response).toEqual('not-found');
            });
        });
    });

    describe('binarta entity exists', function () {
        var exists, args, response;

        beforeEach(inject(function (binartaEntityExists) {
            exists = binartaEntityExists;
            args = {request: {}};
            args.$scope = $scope;
            args.success = function () {
                response = true;
            };
            args.notFound = function () {
                response = false;
            }
        }));

        function execute() {
            return exists(args);
        }

        describe('given id', function () {
            beforeEach(function () {
                args.entity = 'E';
                args.request.id = 'id';
            });

            it('call server', function () {
                execute();
                expect(request().params.method).toEqual('HEAD');
                expect(request().params.url).toEqual('http://host/api/entity/E');
                expect(request().params.params).toEqual({namespace: 'N', id: 'id'});
                expect(request().params.withCredentials).toBeTruthy();
            });

            it('exists', function () {
                execute();
                request().success();
                expect(response).toEqual(true);
            });

            it('not exists', function () {
                execute();
                request().notFound();
                expect(response).toEqual(false);
            });
        });
    });

    describe('binarta entity echo', function () {
        var echo, args, response;

        beforeEach(inject(function (binartaEntityEcho) {
            echo = binartaEntityEcho;
            args = {request: {}};
            args.$scope = $scope;
            args.success = function (payload) {
                response = payload;
            };
        }));

        function execute() {
            echo(args);
        }

        describe('given entity', function () {
            beforeEach(function () {
                args.entity = 'E';
                args.request.id = 'I';
            });

            it('call server', function () {
                execute();
                expect(request().params.method).toEqual('POST');
                expect(request().params.url).toEqual('http://host/api/echo/E');
                expect(request().params.data).toEqual({id: 'I'});
                expect(request().params.withCredentials).toBeTruthy();
            });

            it('success', function () {
                execute();
                request().success('D');
                expect(response).toEqual('D');
            })
        });

    });
});

angular.module('test.app', ['binarta.search'])
    .config(['binartaEntityDecoratorsProvider', function (binartaEntityDecoratorsProvider) {
        binartaEntityDecoratorsProvider.add({
            entity: 'decorated-entity',
            action: 'view',
            mapper: function (it) {
                it.decoratedMsg = 'decorated ' + it.msg;
                return it;
            }
        });

        binartaEntityDecoratorsProvider.add({
            entity: 'decorated-entity',
            action: 'action.request',
            mapper: function (it) {
                it.field = 'decorated ' + it.field;
                return it;
            }
        });
    }]);
