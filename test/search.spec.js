describe('search.js', function() {
    var ctrl, $scope, rest, topics, dispatcher;

    beforeEach(module('binarta.search'));
    beforeEach(inject(function($rootScope, restServiceHandler, config, topicRegistryMock, topicMessageDispatcherMock) {
        $scope = $rootScope.$new();
        rest = restServiceHandler;
        topics = topicRegistryMock;
        dispatcher = topicMessageDispatcherMock;
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
            describe('without autosearch', function() {
                beforeEach(function() {
                    $scope.init({
                        entity:'E',
                        context:'C',
                        filters:{customField:'F'}
                    });
                });

                it('and query parameter is provided', inject(function($location) {
                    $location.search('q', 'text');
                    $scope.init({});
                    expect($scope.q).toEqual('text');
                    expect($location.search().q).toBeUndefined();
                }));

                describe('and locale selected', function() {
                    beforeEach(function() {
                        topics['i18n.locale']('en');
                    });

                    it('no events are registered with app.start', inject(function() {
                        expect(topics['app.start']).toBeUndefined();
                    }));
                });
            });

            describe('with autosearch', function() {
                beforeEach(function() {
                    $scope.init({
                        entity:'E',
                        context:'C',
                        filters:{customField:'F'},
                        autosearch:true
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
                        expect(request().params.data.args).toEqual({namespace:'N', customField:'F', subset:{offset:0, count:10}});
                        expect(request().params.headers['Accept-Language']).toEqual('en');
                        expect(request().params.withCredentials).toBeTruthy();
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

                    describe('and with search results', function() {
                        var results;

                        beforeEach(function() {
                            results = [{name:'item-1'}];
                            $scope.search();
                            request().success(results);
                        });

                        it('exposed on scope', function() {
                            expect($scope.results).toEqual(results);
                        });

                        it('subsequent searches rest results', function() {
                            $scope.search();
                            expect($scope.results).toEqual([]);
                        });

                        it('search results can be removed from the view', function() {
                            results[0].remove();
                            expect($scope.results).toEqual([]);
                        });

                        it('search results can be updated', inject(function() {
                            results[0].update({name:'item-1-alt'});
                            expect(results[0].name).toEqual('item-1-alt');
                        }));

                        describe('when searching for more', function() {
                            beforeEach(function() {
                                rest.reset();
                                $scope.searchForMore();
                            });

                            it('increment offset with count', function() {
                                expect(request().params.data.args.subset).toEqual({offset:1, count:10});
                            });

                            it('new searches reset the offset', function() {
                                $scope.search();
                                expect(request().params.data.args.subset).toEqual({offset:0, count:10});
                            });

                            describe('and more results found', function() {
                                beforeEach(function() {
                                    request().success(results);
                                });

                                it('append to search results', function() {
                                    expect($scope.results.length).toEqual(2);
                                });

                                describe('and searching for more', function() {
                                    beforeEach(function() {
                                        rest.reset();
                                        $scope.searchForMore();
                                    });

                                    it('increment offset with count', function() {
                                        expect(request().params.data.args.subset).toEqual({offset:2, count:10});
                                    });
                                });
                            });

                            describe('and searching for more', function() {
                                beforeEach(function() {
                                    request().success([]);
                                    rest.reset();
                                    $scope.searchForMore();
                                });

                                it('increment offset with count', function() {
                                    expect(request().params.data.args.subset).toEqual({offset:1, count:10});
                                });
                            });

                            describe('when no more are found', function () {
                                beforeEach(function() {
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
                })
            });

            it('a custom page size can be specified on init', function() {
                $scope.init({subset:{count:5}});
                $scope.search();
                expect(request().params.data.args).toEqual({namespace:'N', subset:{offset:0, count:5}});
            });
        });
    });

    describe('RedirectToSearchController', function() {
        beforeEach(inject(function($controller) {
            ctrl = $controller(RedirectToSearchController, {$scope:$scope});
        }));

        describe('on init', function() {
            beforeEach(function() {
                $scope.init({page:'/page/'});
            });

            describe('and submit', function() {
                beforeEach(function() {
                    $scope.q = 'text';
                    $scope.locale = 'locale';
                    $scope.submit();
                });

                it('then redirect to configured path with embedded query string', inject(function($location) {
                    expect($location.search().q).toEqual($scope.q);
                    expect($location.path()).toEqual('/locale/page/');
                }));

                describe('without locale', function() {
                    beforeEach(function() {
                        $scope.locale = undefined;
                    });

                    it('test', inject(function($location) {
                        $scope.submit();
                        expect($location.path()).toEqual('/page/');
                    }));
                });
            });
        });
    });
});