module.exports = function (RED) {
  var pkg = require('../../package.json'),
    cfenv = require('cfenv'),
    fs = require('fs'),
    temp = require('temp'),
    qs = require('qs'),
    request = require('request'),
    fileType = require('file-type'),
    watson = require('watson-developer-cloud'),
    username, password,
    service = cfenv.getAppEnv().getServiceCreds(/retrieve and rank/i);

  temp.track();

  if (service) {
    username = service.username;
    password = service.password;
  }

  RED.httpAdmin.get('/watson-retrieve-and-rank/vcap', function (req, res) {
    res.json(service ? {bound_service: true} : null);
});

 function searchAndRankNode(config) {
    RED.nodes.createNode(this, config);
    var node = this;

    this.on('input', function(msg) {
      setupRankRetrieveNode(msg,config,this,function(retrieve_and_rank) {

        var clusterid;
        (config.clusterid !== '') ? clusterid = config.clusterid : clusterid = msg.cluster_id;
        var collectionname;
        (config.collectionname !== '') ? collectionname = config.collectionname
         : collectionname = msg.collection_name;
        var params = {
          cluster_id: clusterid,
          collection_name: collectionname
        };
        //Get a Solr client for indexing and searching documents.
        var solrClient = retrieve_and_rank.createSolrClient(params);

        var rankerid;
        (config.rankerid !== '') ? rankerid = config.rankerid : rankerid = msg.ranker_id;
        var question = msg.payload;

        var query;

        if(config.searchmode === 'search') {
          query = qs.stringify({q: question, fl: 'id,title,body'});
        } else {
          query = qs.stringify({q: question, ranker_id: rankerid, fl: 'id,title,body'});
        }

        solrClient.get('fcselect', query, function(err, searchResponse) {
          handleWatsonCallback(null,node,msg,err,searchResponse);
        });

      });
    });
}

 RED.nodes.registerType('watson-retrieve-rank-credentials-v2', serviceCredentialsConfigurationNode);
 RED.nodes.registerType('watson-retrieve-rank-search-and-rank', searchAndRankNode, {
    credentials: {
      username: {type:'text'},
      password: {type:'password'}
    }
});

  function serviceCredentialsConfigurationNode(config) {
    RED.nodes.createNode(this,config);
    this.username = config.username;
    this.password = config.password;
}

function setupRankRetrieveNode(msg,config,node,callback) {
    //Check for payload
    if (!msg.payload) {
      var message = 'Missing property: msg.payload';
      node.error(message, msg)
      return;
    }

    //Check credentials
    this.credentials = RED.nodes.getNode(config.servicecreds);
    username = username || this.credentials.username;
    password = password || this.credentials.password;

    if (!username || !password) {
      message = 'Missing Retrieve and Rank service credentials';
      return node.error(message, msg);
    }

    //Connect to Watson
    var retrieve_and_rank = watson.retrieve_and_rank({
      username: username,
      password: password,
      version: 'v1',
      headers: {
        'User-Agent': pkg.name + '-' + pkg.version
      }
    });

    callback(retrieve_and_rank);
}


  function handleWatsonCallback(mode,node,msg,err,res,cb) {
    if (err) {
      var message = '';
      if (err.description) {
        message = err.description;
      } else if (err.message) {
        message = err.message;
      } else if (err.error) {
        message = err.error;
      }
      node.status({});
      return node.error(message, msg);
    } else {
      (mode == 'delete' && Object.keys(res).length == 0) ? msg.payload = 'Ranker deleted' : msg.payload = res;
      if (mode != 'index') {
        node.send(msg);
      }
      if (cb) cb();
    }
}
}

