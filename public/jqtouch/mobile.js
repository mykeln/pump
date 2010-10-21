var jQT = new $.jQTouch({
  icon:'apple-touch-icon.png',
  addGlossToIcon: false,
  startupScreen:"apple-touch-startup.png",
  statusBar:'black-translucent',
  preloadImages:[
    '/jqtouch/themes/pump/img/back_button.png',
    '/jqtouch/themes/pump/img/back_button_clicked.png',
    '/jqtouch/themes/pump/img/button_clicked.png',
    '/jqtouch/themes/pump/img/grayButton.png',
    '/jqtouch/themes/pump/img/whiteButton.png',
    '/jqtouch/themes/pump/img/loading.gif'
  ]
});

// define db information
var databaseOptions = {
	fileName: "pump_db",
	version: "1.0",
	displayName: "Pump Workout Data",
	maxSize: 20000
};

// connect to db
var database = openDatabase(
	databaseOptions.fileName,
	databaseOptions.version,
	databaseOptions.displayName,
	databaseOptions.maxSize
);


if !($page.data("loaded")) {

// create first table if it doesn't exist
database.transaction(
function(transaction) {

	transaction.executeSql(
	"CREATE TABLE IF NOT EXISTS workout (" +
	"id TEXT NOT NULL PRIMARY KEY," +
	"name TEXT UNIQUE NOT NULL," +
	"type TEXT" +
	");"
	);
	
	transaction.executeSql(
	"CREATE TABLE IF NOT EXISTS exercise (" +
	"id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT," +
	"name TEXT UNIQUE NOT NULL," +
	"info TEXT NOT NULL" +
	");"
	);
	
	transaction.executeSql(
	"CREATE TABLE IF NOT EXISTS relationship (" +
	"id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT," +
	"workout_id TEXT NOT NULL," +
	"exercise_id INT NOT NULL" +
	");"
	);
	
	transaction.executeSql(
	"CREATE TABLE IF NOT EXISTS rep (" +
	"id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT," +
	"ex_id INTEGER NOT NULL," +
	"rep_date TEXT NOT NULL," + 
	"weight INTEGER NOT NULL," +
	"reps INTEGER NOT NULL" +
	");"
	);
}
);

// grab seed workout data for initial db load
// SHOULD ONLY RUN ONCE IF TABLES DON'T EXIST
$.getJSON("/pump_seed.js",
function(data){
  $.each(data.workouts, function(i,item){
    // setting variables from JSON
    var id    = item.id;
    var name = item.name;
    var type = item.type;

    // inserting item into the db
    database.transaction(
      function(transaction) {
        transaction.executeSql('INSERT OR IGNORE INTO workout (id,name,type) VALUES (?, ?, ?);', [ id, name, type ]);
      }
    );
  });

  $.each(data.exercises, function(i,item){
    // setting variables from JSON
    var name = item.name;
    var info = item.info;
    var workouts = item.workouts.split(',');
		// setting exercise_id here so nested each can access it
    var exercise_id = null;

    // inserting item into the db
    database.transaction(
     function(transaction) {
         transaction.executeSql('INSERT OR IGNORE INTO exercise (name,info) VALUES (?, ?);', [ name, info ],
         function (transaction, results) {
					// getting the ID of the inserted exercise
         	exercise_id = results.insertId;
         });
     }
    );

		// for each exercise, add an entry to the relationship table
    $.each(workouts, function(j,workout_id){
      database.transaction(
        function(transaction) {
          transaction.executeSql('INSERT OR IGNORE INTO relationship (exercise_id,workout_id) VALUES (?, ?);', [ exercise_id, workout_id ]);
        }
      );
    });
  });
});

$page.data("loaded" true);

} // end db_loaded check


/////////////////////////////////////
// TRANSACTION HANDLERS /////////////
/////////////////////////////////////

// used as global error handler
function errorHandler(transaction, error)
{
	/*! when passed as the error handler, this causes a transaction to fail with a warning message. */
	// error.message is a human-readable string.
	// error.code is a numeric error code
	alert('Oops. Error was '+error.message+' (Code '+error.code+')');

	// handle errors here
	var we_think_this_error_is_fatal = true;
	if (we_think_this_error_is_fatal) return true;
	return false;
}

////////////////////////////////////
// SERVICE FUNCTIONS ///////////////
////////////////////////////////////

// save a set for an exercise
var saveSet = function(ex_id, rep_date, weight, reps, callback) {
	database.transaction(
		function(transaction) {
			transaction.executeSql('INSERT INTO rep (ex_id,\'rep_date\',weight,reps) VALUES (?, ?, ?, ?);', [ ex_id, rep_date, weight, reps ],
			function (transaction, results) {
      	callback(results.insertId);
      }, errorHandler);
		}
	);
};

// get all sets in an exercise
var getSets = function(callback, ex_id) {
	database.transaction(
		function(transaction) {
			transaction.executeSql('SELECT * FROM rep WHERE ex_id=' + ex_id + ';', [],
			// used as handler on 'get'
      function (transaction, results) {
				console.log('Getting sets for exercise id' + ex_id +'');
	
      	callback(results);
      }, errorHandler);
		}
	);
};

// delete all sets in an exercise
var deleteSets = function(callback) {
	database.transaction(
		function(transaction) {
			transaction.executeSql('DELETE FROM rep;', [], 
			function() {
				callback();
			}, errorHandler);
		}
	);
};

// get all workouts in a workout
var getWorkouts = function(callback) {
	database.transaction(
		function(transaction) {
			transaction.executeSql('SELECT * FROM workout ORDER BY name;', [],
			// used as handler on 'get'
      function (transaction, results) {
      	callback(results);
      }, errorHandler);
		}
	);
};

// get all exercises in a workout
var getExercises = function(callback, w_id) {
	var ex_id = null;
	
	database.transaction(
		function(transaction) {
			transaction.executeSql('SELECT exercise.id,exercise.name,exercise.info FROM exercise INNER JOIN relationship ON exercise.id=relationship.exercise_id WHERE workout_id=\"' + w_id + '\";', [],
			// used as handler on 'get'
      function (transaction, results) {
				callback(results,w_id);

      }, errorHandler);
		}
	);
}

// convert sentence to lowercase with underscores
function convertToDynamic(text)
{
	return text
  	.toLowerCase()
  	.replace(/[^\w ]+/g,'')
  	.replace(/ +/g,'-')
  	;
}

////////////////////////////////////
// RENDERING APP ///////////////////
////////////////////////////////////

// when the DOM is ready, init scripts
$(function() {

	var form = $("#set_form");

	// count the amount exercises associated with each workout
	var workout_count = $("ul.plastic").size();

	for( i=0; i < workout_count; i++){
		// dynamically show exercise counts on workout list
	  var phase_counter = $('ul.phase'+i+' li').size();
	  $('small.phase'+i+'_counter').text(phase_counter);
	}
	

	// refresh the workouts list
	var refreshWorkouts = function(results) {
		var workout_list = $("#workouts");
		
    // clear out the list of exercises
    workout_list.empty();

    // check to see if we have any results.
    if (!results) {
			workout_list.append("<li>None</li>");
    }

    // loop over the current list of workouts and add them
    $.each(
    	results.rows,
    	function(rowIndex) {
				var row = results.rows.item(rowIndex);
				
				// append the list item.
				workout_list.append("<li><a href=\"#" + row.id + "\">" + row.name + "</a><small class=\"counter " + row.id + "_counter\">12</small></li>");

				// populate each of the workout exercise pages
				$('body').append('<div class="single_workout" id="' + row.id + '"><div class="toolbar"><a class="back" href="#">Back</a><h1>' + row.name + '</h1> </div><ul class="plastic ' + row.id + '"></li> </ul> </div> <ul class="rounded"></ul>');
				
				// refresh the exercises list
				getExercises(refreshExercises, row.id);

			}
    );
	};
	
	// refresh the workouts list
	var refreshExercises = function(results, w_id) {
		var exercise_id = null;
		
    // loop over the current list of workouts and add exercises to them
    $.each(
    	results.rows,
    	function(rowIndex) {
				var row = results.rows.item(rowIndex);
				exercise_id = (row.id);
				
								
				// populate each of the workout exercise pages
				$('.' + w_id + '').append('<li class="arrow" id="id_' + exercise_id + '"><a href="#record_set" id="id_' + exercise_id + '" name="id_' + exercise_id + '">' + row.name + '</a>');
			}
    );

		form.prepend('<input type="hidden" class="ex_id" name="ex_id" value="1"/>');


		// refresh the sets list
	  getSets(refreshSets, exercise_id);
	};

	// refresh the exercises list
	var refreshSets = function(results) {
		var list = $("#sets");
		
    // clear out the list of exercises
    list.empty();

    // loop over the current list of sets and add them
    $.each(
    results.rows,
    function(rowIndex) {
			var row = results.rows.item(rowIndex);
			// append the list item.
			list.prepend("<li>" + row.reps + " reps of " + row.weight + " lbs</li>");
			}
    );

	};

  // bind the form to save the exercise
  form.submit(
  	function(event) {
    	// prevent the default submit
			event.preventDefault();
			
			// check inputs to ensure no blanks
			var myDate = new Date();
						
			var ex_id = form.find("input.ex_id").val();
			var rep_date = (myDate.getMonth()+1) + '/' + myDate.getDate() + '/' + myDate.getFullYear() + ', ' + myDate.getHours() + ':' + myDate.getMinutes();
			var weight = form.find("input.weight").val();
			var reps = form.find("input.reps").val();
			
			// validation checks
			// testing if numbers were entered in weight/reps
			var numberRegex = /^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/;
						
      if(weight.length > 0 && reps.length > 0 && numberRegex.test(weight) && numberRegex.test(reps)){    
				// save the exercise
				saveSet(
					ex_id,
					rep_date,
					weight,
					reps,
					function() {
				
						// reset the form inputs
						// form.find("input.weight").val("");
						 form.find("input.reps").val("");

						// refresh the exercise list
						getSets(refreshSets, ex_id);
					}
				);
			} else {
				alert("You're missing a value, or entered a non-number.")
				
			}
		}
	);

	// refresh the workouts list
	getWorkouts(refreshWorkouts);
	
	
}); // end jQuery function();