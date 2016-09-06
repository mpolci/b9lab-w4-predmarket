angular.module('predictionMarketApp').controller('createMarketController', function ($scope, $timeout, $log, $ngRedux, marketCreationActions, predictionMarketService, mistService) {
  var self = this
  angular.extend(this, {
    doCreate: doCreate,
    doPublish: doPublish,
  })

  let unsubscribe = $ngRedux.connect(state => ({
    marketCreation: state.marketCreation,
  }), marketCreationActions)(this);
  $scope.$on('$destroy', unsubscribe);

  var marketCreation=self.marketCreation
  $log.debug('createMarketController initialization')
  web3.eth.getCoinbase(function (coinbase) {
    marketCreationActions.chgMarketCreationArgs({
      question: 'prova',
      expirationTime: Math.floor(Date.now() / 1000) + 60,
      responder: coinbase,
      feeRate: 100,
      initialPrize: 1000000000000000000,
    })
  })
  
  function doCreate() {
    self.reqNewMarket(self.marketCreation)
  }

  function doPublish() {
    self.reqPublish(self.marketCreation.created)
  }

})
