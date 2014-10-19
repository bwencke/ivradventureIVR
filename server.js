// Module dependencies.
var application_root = __dirname,
    express = require( 'express' ); //Web framework

//Create server
var app = express();

// Configure server
app.configure( function() {
    //parses request body and populates request.body
    app.use( express.bodyParser() );

    //checks request.body for HTTP method overrides
    app.use( express.methodOverride() );

    //perform route lookup based on url and HTTP method
    app.use( app.router );

    //Show all errors in development
    app.use( express.errorHandler({ dumpExceptions: true, showStack: true }));
});

var mysql      = require('mysql');
var connection = mysql.createConnection({
  host     : '128.211.196.237',
  user     : 'root',
  password : ''
});
connection.connect();

function playMsg(id, msg) {
    console.log("Play Message: { " + id + ", " + msg + " }");
    var ret = {
        "action" : "play",
        "message" : msg || null,
        "id" : id || null
    };
    return ret;
}

function getDigits(id) {
    console.log("Get Digits: { " + id + " }");
    var ret = {
        "action" : "getdigits",
        "id" : id || null
    };
    return ret;
}

function queryDB(query, callback) {
    console.log("Query Database: { " + query + ", " + callback + " }");
    var ret = "";

    connection.query(query, function(err, rows, fields) {
      if (err) throw err;

      ret = rows;
      console.log('Query Result: ', rows);
      callback(rows);
    });

    return ret;
}

var numChoices = 3;
function loadChapter(queryResults) {
    currentChapter = new Chapter();
    currentChapter.id = queryResults[0].id;
    currentChapter.story_id = queryResults[0].story_id;
    currentChapter.scenario = queryResults[0].scenario;
    currentChapter.choices = (function() {
        var result = [];
        if(queryResults[0].choice_one_id && queryResults[0].choice_one) {
            result.push(new Choice(queryResults[0].choice_one_id, queryResults[0].choice_one));
        }
        if(queryResults[0].choice_two_id && queryResults[0].choice_two) {
            result.push(new Choice(queryResults[0].choice_two_id, queryResults[0].choice_two));
        }
        if(queryResults[0].choice_three_id && queryResults[0].choice_three) {
            result.push(new Choice(queryResults[0].choice_three_id, queryResults[0].choice_three));
        }
        return result;
    })();
}

function Story(id) {
    var self = this;
    self.id = id || null;
    self.name = null;
    self.chapter_one = null;
}
function Chapter() {
    var self = this;
    self.id = null;
    self.story_id = null;
    self.scenario = "";
    self.choices = [];
    self.play = function() {
        var ret = "";
        if(previousChoice) {
            ret += "You " + previousChoice + ". ";
        }
        ret += self.scenario;
        self.choices.forEach(function(choice, index) {
            ret += " To " + choice.getText() + ", press " + (index+1) + ".";
        });
        if(currentChapter.choices.length > 0) {
            ret += " To hear the options again, press 9.";
        }
        return ret;
    };
}
function Choice(toChapter, text) {
    var self = this;
    self.toChapter = toChapter || null;
    var text = text || "";
    self.getText = function() {
        var modifiedText = text;
        if(modifiedText.substr(modifiedText.length - 1) === '.') {
            modifiedText = modifiedText.substring(0, modifiedText.length-1)
        }
        return modifiedText;
    };
}
var story = null;
var currentChapter = null;
var previousChoice = null;

//Router
app.post( '/nextaction', function( request, response ) {
    var action = request.body.lastactionid;
    var digits = request.body.lastdigitsreceived;
    console.log("Action: " + action);
    console.log("Digits: " + digits);
    if(!story) {
        currentChapter = null;
        previousChoice = null;
        switch(action) {
            case "load_story":
                console.log("Load Story: { " + digits + " }");
                story = new Story(digits);
                break;
            case "story_digits":
                var ret = getDigits("load_story");
                sendResponse(ret);
                return;
            default:
                var ret = playMsg("story_digits", "Please enter the 4 digit story id number");
                sendResponse(ret);
                return;
        }
    }
    if(!currentChapter) {
        console.log("Load First Chapter");
        queryDB('SELECT * FROM storybook.stories WHERE id=' + story.id, function(result) {
            console.log("Save story data");
            story.name = result[0].name;
            story.chapter_one = result[0].chapter_one;
            currentChapter = new Chapter();
            currentChapter.id = result[0].chapter_one;
            queryDB('SELECT * FROM storybook.chapters WHERE story_id=' + story.id + ' AND id=' + currentChapter.id, function(queryResults) {
                        loadChapter(queryResults);
                        var ret = playMsg("chapter_digits", currentChapter.play());
                        sendResponse(ret);
                        return;
                    });
            });
    } else {
        switch(action) {
            case "load_chapter":
                var input = digits;
                digits = 0;
                if(input && input > 0) {
                    if(input == 9) {
                        var ret = playMsg("chapter_digits", currentChapter.play());
                        sendResponse(ret);
                        return;
                    }
                    if(input > currentChapter.choices.length) {
                        var ret = playMsg("chapter_digits", "There is no choice " + input + ", you asshole. Try again.");
                        sendResponse(ret);
                        return;
                    }
                    previousChoice = currentChapter.choices[input-1].getText();
                    currentChapter.id = currentChapter.choices[input-1].toChapter;
                } else {
                    var ret = playMsg("chapter_digits", currentChapter.play());
                    sendResponse(ret);
                    return;
                }
                queryDB('SELECT * FROM storybook.chapters WHERE story_id=' + story.id + ' AND id=' + currentChapter.id, function(queryResults) {
                        loadChapter(queryResults);
                        var ret;
                        if(currentChapter.choices.length > 0) {
                            ret = playMsg("chapter_digits", currentChapter.play());
                        } else {
                            ret = playMsg("end_story_digits", currentChapter.play() + ". To play this story again, press one. To play another story, press 2. To hear the options again, press 9.");
                        }
                        sendResponse(ret);
                        return;
                    });
                break;
            case "chapter_digits":
                var ret = getDigits("load_chapter");
                sendResponse(ret);
                break;
            case "end_story_digits":
                var ret = getDigits("end_story");
                sendResponse(ret);
            case "end_story":
                var input = digits;
                digits = 0;
                if(input && input > 0) {
                    if(input === 9) {
                        var ret = playMsg("end_story_digits", currentChapter.play() + ". To play this story again, press one. To play another story, press 2. To hear the options again, press 9.");
                        sendResponse(ret);
                        return;
                    }
                    if(input > 2) {
                        var ret = playMsg("end_story_digits", "There is no choice " + input + ", you asshole. Try again.");
                        sendResponse(ret);
                        return;
                    }
                    if(input === 1) {
                        previousChoice = null;
                        currentChapter.id = story.chapter_one;
                        queryDB('SELECT * FROM storybook.chapters WHERE story_id=' + story.id + ' AND id=' + currentChapter.id, function(queryResults) {
                                loadChapter(queryResults);
                                var ret = playMsg("chapter_digits", currentChapter.play());
                                sendResponse(ret);
                                return;
                            });
                    }
                    if(input === 2) {
                        story = null;
                        var ret = playMsg("story_digits", "Please enter the 4 digit story id number");
                        sendResponse(ret);
                        return;
                    }
                } else {
                    var ret = playMsg("end_story_digits", currentChapter.play() + ". To play this story again, press one. To play another story, press 2. To hear the options again, press 9.");
                    sendResponse(ret);
                    return;
                }
            default:
        }
    }

    function sendResponse(ret) {
        response.send(ret);
    }
});

//Start server
var port = process.env.PORT || 5000;
app.listen( port, function() {
    console.log( 'Express server listening on port %d in %s mode', port, app.settings.env );
});