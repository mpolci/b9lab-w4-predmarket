module.exports = {
  build: {
    "index.html": "index.html",
    "app.js": [
      "../node_modules/eth-lightwallet/dist/lightwallet.js",
      "../node_modules/hooked-web3-provider/build/hooked-web3-provider.js",
      "javascripts/app.js"
    ],
    "angularapp.js": [
      "javascripts/angular/routes.js",
      "javascripts/angular/state.factory.js",
      "javascripts/angular/predictionMarket.service.js",
      "javascripts/angular/controlAccount.controller.js",
      "javascripts/angular/predictionMarkets.controller.js",
      "javascripts/angular/createMarket.controller.js",
      "javascripts/angular/marketOperations.controller.js",
      "javascripts/angular/accounts.service.js",
      "javascripts/angular/mist.js",
      "javascripts/angular/filters.js",
    ],
    "app.css": [
      "stylesheets/app.css"
    ],
    "views/": "views/"
  },
  deploy: [
    "AddressSet",
    "PredictionMarketsIndex"
  ],
  rpc: {
    host: "localhost",
    port: 8545
  }
};
