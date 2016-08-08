angular.module('predictionMarketApp').controller('predictionMarketsController', function ($scope, $log, $timeout, $state, $ngRedux, marketsListActions, appState, predictionMarketService) {
  var self = this
  angular.extend(this, {
    // availMrktAddrs: appState.markets.availMrktAddrs,
    // marketsDetails: appState.markets.marketsDetails,

    selectMarket: selectMarket
  })

  let unsubscribe = $ngRedux.connect(state => ({
    availMrktAddrs: state.markets.availMrktAddrs,
    marketsDetails: state.markets.marketsDetails,
  }), marketsListActions)(this);
  $scope.$on('$destroy', unsubscribe);

  // predictionMarketService.retrieveMarkets()
  // .then(() =>
  //   $timeout(() => $scope.$apply())
  // ).catch($log.error)
  self.reqRefreshMarkets()

  function selectMarket(addr) {
    appState.marketOperations.selectedMarket = addr
    $state.go('market')
  }
})
