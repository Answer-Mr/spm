define("#public/1111/core/js/config-debug", [], {
  name: 'config',
  version: '1.0'
});


define("#public/1111/core/js/utils-debug", [], function(require, exports) {
    exports.log = function(str) {
        console.info('[log] ' + str);
    };
});


define("#public/1111/contact/model/m-debug", ["../../core/js/config-debug", "../../core/js/utils-debug"], function(require, exports, module) {
  var tpl = '<div>hello</div>';
  var config = require('../../core/js/config-debug'); 
  var utils = require('../../core/js/utils-debug'); 
  
  exports.say = function() {
    utils.log('tpl----->' + tpl);
    utils.log('config--->', config);
  };
});


define("#public/1111/main-debug", ["./core/js/config-debug", "./core/js/utils-debug", "./contact/model/m-debug", "#jquery/1.7.2/jquery-debug", "#base/1.0.0/base-debug", "#class/1.0.0/class-debug", "#events/1.0.0/events-debug"], function(require, exports, module) {
  var m = require('./contact/model/m-debug');
  var $ = require('#jquery/1.7.2/jquery-debug');
  var base = require('#base/1.0.0/base-debug');

  exports.say = function(id) {
    m.say();
    console.info($(id));
    console.info(base);
  };
});
