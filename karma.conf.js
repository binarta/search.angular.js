basePath = './';

files = [
    JASMINE,
    JASMINE_ADAPTER,
    'bower_components/angular/angular.js',
    'bower_components/angular-mocks/angular-mocks.js',
    'bower_components/binarta.usecase.adapter.angular/src/angular.usecase.adapter.js',
    'bower_components/thk-rest-client-mock/src/rest.client.mock.js',
    'bower_components/thk-config-mock/src/config.mock.js',
    'bower_components/thk-notifications-mock/src/notifications.mock.js',
    'src/**/*.js',
    'test/**/*.js'
];

autoWatch = true;

browsers = ['PhantomJS'];

junitReporter = {
    outputFile: 'test_out/unit.xml',
    suite: 'unit'
};