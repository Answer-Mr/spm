define("test1/module/0.0.1/module",[],function(e,t){t.get=function(e){return $(e)}}),define("test1/module/0.0.1/debugRequire",["./module"],function(e,t){var n=e("./module"),r=e("module");t.say=function(){n.get(),r.get()}});