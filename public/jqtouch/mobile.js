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


function dbCreate() {
	database.transaction(
		function(transaction) {
			// holds each workout
			transaction.executeSql(
				"CREATE TABLE IF NOT EXISTS workout (" +
				"id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT," +
				"name TEXT UNIQUE NOT NULL," +
				"type TEXT" +
				");"
			);
	
			// holds each exercise, along with technique information
			// FIXME: technique information will likely be replaced with personal record data
			// FIXME: allow multiple infos to be set (for strength vs. power workouts, but same exercise)
			transaction.executeSql(
				"CREATE TABLE IF NOT EXISTS exercise (" +
				"id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT," +
				"name TEXT UNIQUE NOT NULL," +
				"info TEXT NOT NULL" +
				");"
			);
	
			// links exercises to workouts. bridge table.
			transaction.executeSql(
				"CREATE TABLE IF NOT EXISTS relationship (" +
				"id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT," +
				"workout_id TEXT NOT NULL," +
				"exercise_id INT NOT NULL" +
				");"
			);
	
			// holds set data per each exercise
			// FIXME: store highest total weight lifted for comparison (reps * weight)
			transaction.executeSql(
				"CREATE TABLE IF NOT EXISTS pump (" +
				"id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT," +
				"ex_id INTEGER NOT NULL," +
				"rep_date TEXT NOT NULL," + 
				"weight INTEGER NOT NULL," +
				"reps INTEGER NOT NULL" +
				");"
			);
		}
	);
}


// grab seed data from a json file
$.getJSON("/pump_seed.js", function(data){
	$.each(data.workouts, function(i,item){
		// for each of the workouts found, assign them to variables
		var workoutImportName	= item.name;
		var workoutImportType	= item.type;
	
		// insert each workout into the db
		database.transaction(function(transaction) {
			transaction.executeSql('INSERT OR IGNORE INTO workout (name,type) VALUES (?, ?);',
			[ workoutImportName, workoutImportType ]);
		});
	});

	$.each(data.exercises, function(i,item){
		// for each of the exercises found, assign them to variables
		var exerciseImportName = item.name;
		var exerciseImportInfo = item.info;
		
		// split the 'workouts' object in the json into separate parts
		// this is how the app knows which exercise to assign to which workout
		// FIXME: find a better way to do this
		var exerciseImportWorkouts = item.workouts.split(',');
	
		// setting exercise_id here so the nested each below can access it
		var exercise_id = null;

		// inserting item into the db
		database.transaction(function(transaction){
			transaction.executeSql('INSERT OR IGNORE INTO exercise (name,info) VALUES (?, ?);',
			[ exerciseImportName, exerciseImportInfo ],
			function (transaction, results) {
				// getting the id of the inserted exercise
				exercise_id = results.insertId;
			});
		});
		
		$.each(exerciseImportWorkouts, function(j,workout_id){
			// for each exercise/workout combination, add an entry to the relationship table
			database.transaction(function(transaction) {
					transaction.executeSql('INSERT OR IGNORE INTO relationship (exercise_id,workout_id) VALUES (?, ?);',
					[ exercise_id, workout_id ]);
			});
		});
	});
});



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

// save a set for a specific exercise
var saveSet = function(ex_id, weight, reps, callback) {
	// needs ex_id passed to it so it knows which exercise to assign the set to
	// needs rep_date so it knows when the set was accomplished
	// needs reps/weight for the set	
	var rep_date = (myDate.getMonth()+1) + '/' + myDate.getDate() + '/' + myDate.getFullYear() + ', ' + myDate.getHours() + ':' + myDate.getMinutes();
	
	// insert set into the database
	database.transaction(function(transaction){
		transaction.executeSql('INSERT INTO pump (ex_id,"rep_date",weight,reps) VALUES (?, ?, ?, ?);',
		[ ex_id, rep_date, weight, reps ],
		function (transaction, results) {
    	callback(results.insertId);
    }, errorHandler);
	});
};

// get all sets in an exercise
var getSets = function(callback, ex_id) {
	database.transaction(
		function(transaction) {
			transaction.executeSql('SELECT * FROM pump WHERE ex_id=' + ex_id + ';', [],
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
			transaction.executeSql('DELETE FROM pump;', [], 
			function() {
				callback();
			}, errorHandler);
		}
	);
};


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
$(document).ready(function(e){

	// setting click event, so behavior is correct when viewing on iphone vs. simulator, or web page
	var userAgent = navigator.userAgent.toLowerCase();
	var isiPhone = (userAgent.indexOf('iphone') != -1 || userAgent.indexOf('ipod') != -1) ? true : false;
	clickEvent = isiPhone ? 'tap' : 'click';
	
	console.log('User is: ' + userAgent + ', so I will treat all interactions as ' + clickEvent + 's');
	
	///////////////////////
	// RENDERING EVENTS ///
	///////////////////////
	
	// showing initial workout list
	console.log('preparing workouts list');
	
	// empty current list of exercises
	$('#workouts').empty();
	
	// when a single workout is clicked, load the exercises for that workout
	database.transaction(function(transaction) {
		transaction.executeSql('SELECT workout.id,workout.name,workout.type FROM workout;', [],
		function (transaction, results) {
			$.each(
				results.rows,
				function(rowIndex) {
					var row = results.rows.item(rowIndex);
					console.log('displaying workout id: ' + row.id);
					$('#workouts').append('<li><a href="#ex" title="' + row.id + '">' + row.name + '</a></li>');
				}
			);
		}, errorHandler);
	});
	
	
	// when a single workout is clicked
	$('#workouts li a').livequery(clickEvent, function(event, info){
		console.log('workout was clicked');
		
		// empty current list of exercises
		$('#exercises').empty();
		
		// get the id of the workout that was clicked
		var workout_id = $(this).attr('title');
		
		
		// when a single workout is clicked, load the exercises for that workout
		database.transaction(function(transaction) {
			transaction.executeSql('SELECT exercise.id,exercise.name,exercise.info FROM exercise INNER JOIN relationship ON exercise.id=relationship.exercise_id WHERE workout_id="' + workout_id + '";', [],
			function (transaction, results) {
				$.each(
					results.rows,
					function(rowIndex) {
						var row = results.rows.item(rowIndex);
						console.log('displaying exercise id: ' + row.id);
						$('#exercises').append('<li class="arrow"><a href="#rep" title="' + row.id + '">' + row.name + '</a></li>');
					}
				);
			}, errorHandler);
		});

		console.log('getting ready for workout id: ' + workout_id);

	});
		
	// sliding exercise list in
	$('#ex').bind('pageAnimationStart', function(event, info){
		if (info.direction == 'in'){
  		console.log('sliding exercises in');
		}
  });
	
	// when a single exercise is clicked
	// FIXME: this is working properly for hardcoded exercise items, but not for ajaxed ones
	// (it's not registering a click event for some reason.)
	$('#ex li a').livequery(clickEvent, function(event, info){
		console.log('exercise was clicked');
		
		// get the ID of the exercise from the 'title' attribute of the exercise tapped
		var exercise_id = $(this).attr('title');
		// append a hidden input with this ID to the form, so when it's submitted we know
		// which exercise to add the set to
		$('#ex_id').val(exercise_id);
		console.log('getting ready for exercise id: ' + exercise_id);
	});
	
	// sliding set list in
	$('#rep').bind('pageAnimationStart', function(event, info){
		if (info.direction == 'in'){
			console.log('sliding set recorder in');
		}
	});























///////////////////////////////////
// END NEW PUMP CODE ////////////////////
////////////////////////////////////


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
				
			}
    );
	};
	
	// refresh the workouts list
	var refreshExercises = function(results, w_id) {
		var exercise_id = null;
		var info = null;
		
    // loop over the current list of workouts and add exercises to them
    $.each(
    	results.rows,
    	function(rowIndex) {
				var row = results.rows.item(rowIndex);
				exercise_id = (row.id);
				var info = (row.info);
								
				// populate each of the workout exercise pages
				$('.' + w_id + '').append('<li class="arrow" id="id_' + exercise_id + '"><a href="#record_set_' + exercise_id + '" id="id_' + exercise_id + '" name="id_' + exercise_id + '">' + row.name + '</a>');
				
				$('body').append('<div id="record_set_' + exercise_id + '"><div class="toolbar"><a class="back" href="#">Back</a><h1>Recording Set</h1></div><div class="info">' + info + '</div><form id="set_form" action="" method="post" accept-charset="utf-8"><input type="hidden" class="ex_id" name="ex_id" value="' + exercise_id + '"/><h2>Add Set</h2><ul class="rounded"><li><input type="number" name="reps" class="reps" placeholder="Reps" /></li><li><input type="number" name="weight" class="weight" placeholder="Weight" /></li></ul><a href="#" class="grayButton submit">Pump</a></form><h2>Recorded Sets</h2><ul id="sets"><li>None</li></ul>    </div>');

			}
    );


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

	var form = $("#set_form");
  // bind the form to save the exercise
  form.submit(
  	function(event) {
    	// prevent the default submit
			event.preventDefault();
			var blah = $('this').attr('id');
			alert(blah);
			
			// check inputs to ensure no blanks
			var myDate = new Date();
			$(this).parent(form)
			var ex_id = form.find("input.ex_id").val();
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
	//getWorkouts(refreshWorkouts);
	
}); // end jQuery function();