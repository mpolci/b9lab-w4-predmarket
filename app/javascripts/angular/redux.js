
angular.module('predictionMarketApp')
.provider('saga', function () {
  let self = this
  // this.middleware = ReduxSaga.createSagaMiddleware()
  this.middleware = ReduxSaga.default()
  this.$get = ['$ngRedux', 'sagaRoot', function ($ngRedux, sagaRoot) {
    return () => self.middleware.run(sagaRoot)
  }]
})
.config(($ngReduxProvider, sagaProvider) => {
  let enhancers = window.devToolsExtension ? [window.devToolsExtension()] : []
  $ngReduxProvider.createStoreWith({
      accounts: 'accountsReducer',
      selectedAccount: 'selectedAccountReducer',
   }, [sagaProvider.middleware], enhancers)
})
.run((saga) => saga())
.factory('sagaRoot', function (sagaAccounts) {
  return function* sagaRoot() {
    yield [
      ...sagaAccounts(),
    ]
  }

})