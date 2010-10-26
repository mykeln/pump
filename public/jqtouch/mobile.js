////////////////////////////////////////////
// INITIAL SETUP AND CONFIG ////////////////
////////////////////////////////////////////

// setting proprietary jQTouch configurations
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

// defining db information
var databaseOptions = {
	fileName: "pump_db",
	version: "1.0",
	displayName: "Pump Workout Data",
	maxSize: 20000
};

// connecting to db
var database = openDatabase(
	databaseOptions.fileName,
	databaseOptions.version,
	databaseOptions.displayName,
	databaseOptions.maxSize
);

/////////////////////////////////////
// DATABASE HANDLERS ////////////////
/////////////////////////////////////

// setting dataLoad object, which stores the state of the database
var dataLoad = localStorage.getItem('data');

// if the database isn't loaded yet
if (!(dataLoad)){
	
	// create the tables
	console.log('this is the first run, so i am loading the db');
	database.transaction(function(transaction){
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
	}, errorHandler);
	
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

	// setting data loaded to true
	// FIXME: put this in the 'success' area of the function
	localStorage.setItem('data', true);

}


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
	// needs reps/weight for the set
	
	// setting a standard date for the set recorded
	var myDate = new Date();
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
				console.log('pulling sets for exercise id: ' + ex_id +'');

      	callback(results);
      }, errorHandler);
		}
	);
};

// refresh the exercises list
var refreshSets = function(results) {
	var list = $("#sets");
	
  // clear out the list of exercises
  list.empty();

	// if there aren't any recorded sets, put a placeholder
	if (!(results)){
		console.log('no recorded sets');
		// appending a "none" item as a starting point
		list.append("<li>None</li>");
	} else {
		console.log('rendering sets');
	  // loop over the current list of sets and add them
	  $.each(
	  results.rows,
	  function(rowIndex) {
			var row = results.rows.item(rowIndex);
			// append the list item.
			list.prepend("<li>" + row.reps + " reps of " + row.weight + " lbs<small><a href='#' class='delete' title='ZZ_exercise_id'>&times;</a></small></li>");
			}
	  );
	}
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
	
	
/////////////////////////////////////////////
/////////////////////////////////////////////
	
	// when the workouts div exists in the DOM
	if ($('#workouts').length) {  
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
						// FIXME: count the amount of exercises per workout
						
						// render single workout
						console.log('displaying workout id: ' + row.id);
						$('#workouts').append('<li><a href="#ex" title="' + row.id + '">' + row.name + '</a></li>');
					}
				);
			}, errorHandler);
		});
	}
	
	
	
	// when a single workout is clicked
	$('#workouts li a').livequery(clickEvent, function(event, info){
		
		console.log('workout was clicked');
		
		// empty current list of exercises
		$('#exercises').empty();
		
		// get the id of the workout that was clicked
		var workout_id = $(this).attr('title');
		
		// load the exercises for that workout
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
			
			// resetting inputs, since the user had to click back to get here
			form.find("input.reps").val("");
		 	form.find("input.weight").val("");
		 	
			// setting exercise id to refresh sets for
			var exercise_id = $('#ex_id').val();
			
			// refresh the exercise list
			getSets(refreshSets, exercise_id);
		}
	});



	// bind the form to save the exercise
	var form = $("#set_form");
	
	// when form is submitted
  form.submit(function(event){
 		// prevent the default submit
		event.preventDefault();
		
		console.log('form was submitted! attempting to save set...');
		
		// setting variables to be inserted
		var exercise_id = $('#ex_id').val();
		var weight = form.find("input.weight").val();
		var reps = form.find("input.reps").val();
			
		// validation checks
		// testing if numbers were entered in weight/reps
		var numberRegex = /^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/;

    if(weight.length > 0 && reps.length > 0 && numberRegex.test(weight) && numberRegex.test(reps)){    
			// save the exercise
			saveSet(exercise_id,weight,reps,function(){
				
				console.log('saving exercise id: ' + exercise_id + ' / weight: ' + weight + ' / reps: ' + reps );
				
				// reset the rep input only (typical for gym)
			 	form.find("input.reps").val("");

				// refresh the exercise list
				getSets(refreshSets, exercise_id);
			});
		} else {
			console.log('whoops, something is wrong with what the user input');
			alert("You're missing a value, or entered a non-number.")
		}
	});
}); // end jQuery function();