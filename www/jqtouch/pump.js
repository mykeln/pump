////////////////////////////////////////////
// INITIAL SETUP AND CONFIG ////////////////
////////////////////////////////////////////

// setting proprietary jQTouch configurations
var jqtouch = $.jQTouch({
    icon:'apple-touch-icon.png',
    addGlossToIcon: false,
		useFastTouch: true,
    startupScreen:'apple-touch-startup.png',
    statusBar:'default',
    touchSelector: '#sets li a',
    preloadImages: [
        'themes/jqt/img/back_button.png',
        'themes/jqt/img/back_button_clicked.png',
        'themes/jqt/img/button_clicked.png',
        'themes/jqt/img/grayButton.png',
        'themes/jqt/img/whiteButton.png'
        ]
});

// setting whether seed data should be loaded or not
var loadseed = false;

// connecting to db
var database = openDatabase("pump_db", "1.0", "Pump Workout Data", 20000);


/////////////////////////////////////
// DATABASE HANDLERS ////////////////
/////////////////////////////////////

// setting dataLoad object, which stores the state of the seed data
var dataLoad = localStorage.getItem('data');

var dbLoad = localStorage.getItem('db');


// if the database isn't loaded yet
if (!(dbLoad)){
	
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
			"name TEXT NOT NULL," +
			"info TEXT NOT NULL" +
			");"
		);
	

		// links exercises to workouts. bridge table.
		transaction.executeSql(
			"CREATE TABLE IF NOT EXISTS relationship (" +
			"id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT," +
			"workout_id INTEGER NOT NULL," +
			"exercise_id INTEGER NOT NULL" +
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
	
	// setting db loaded to true
	localStorage.setItem('db', true);
	
}

if (loadseed == true){
	if (!(dataLoad)){
		// grab seed data from a json file
		$.getJSON("./pump_seed.js", function(data){
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
		localStorage.setItem('data', true);

	}
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

// save a new workout
var saveWorkout = function(workout,callback) {
	// needs workout passed to it so it knows what to name the workout
	
	// insert set into the database
	database.transaction(function(transaction){
		transaction.executeSql('INSERT INTO workout (name) VALUES (?);',
		[ workout ],
		function (transaction, results) {
    	callback(results.insertId);

			refreshExercises(results.insertId);
			
			// empty the title of the workout
			$('#ex .toolbar h1').empty();
			$('#ex .toolbar h1').append(workout);

			jqtouch.goTo('#ex', 'slideleft');
			
			
    }, errorHandler);
	});
};

// save a new exercise
var saveExercise = function(exercise,exercise_info,workout_id,callback) {
	// needs workout passed to it so it knows what to name the workout
	
	// insert exercise into the database
	database.transaction(function(transaction){
		transaction.executeSql('INSERT INTO exercise (name,info) VALUES (?,?);',
		[ exercise,exercise_info ],
		function (transaction, results) {
			// FIXME: unsure what this does
    	callback(results.insertId);

			var ex_id = results.insertId;
			
			// add entry to connect exercise to a workout
			database.transaction(function(transaction){
				transaction.executeSql('INSERT INTO relationship (workout_id,exercise_id) VALUES (?,?);',
				[ workout_id,ex_id ],
				function (transaction, results) {
					
					refreshExercises(workout_id);

					jqtouch.goBack();


		    }, errorHandler);
			});
			
    }, errorHandler);
	});
};


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
var getSets = function(callback, exercise_id) {
	database.transaction(
		function(transaction) {
			transaction.executeSql('SELECT * FROM pump WHERE ex_id=' + exercise_id + ';', [],
			// used as handler on 'get'
      function (transaction, results) {
				console.log('pulling sets for exercise id: ' + exercise_id +'');

      	callback(results);
      }, errorHandler);
		}
	);
};

// refresh the sets list
var refreshSets = function(results) {

  // clear out the list of exercises
  $('#sets').empty();

	// if there aren't any recorded sets, put a placeholder
	if (!(results)){
		console.log('no recorded sets');
		// appending a "none" item as a starting point
		$('#sets').append("<li>None</li>");
	} else {
		console.log('rendering sets');
	  // loop over the current list of sets and add them
	  $.each(
	  results.rows,
	  function(rowIndex) {
			var row = results.rows.item(rowIndex);
			// append the list item.
			$('#sets').prepend("<li><a href='#' data-identifier='" + row.id + "'>" + row.reps + " reps of " + row.weight + " lbs</a></li>");
			}
	  );
	}
};

var updateRepScreen = function(elem,exercise_id,exercise_info){
	$('.info p').html('<p>' + exercise_info + '</p>');

	// refresh the exercise list
	getSets(refreshSets, exercise_id);

	// get the next exercise id in the workout
	var next_set = $(elem).parent('li').next('li').find('a').attr('data-identifier');

	// assign the exercise ID of the next exercise in the list to the 'next set' button
	$('#next_set').attr('data-identifier', next_set);


	// append a hidden input with this ID to the form, so when it's submitted we know
	// which exercise to add the set to
	$('#ex_id').val(exercise_id);
}

// refresh the workouts list
var refreshWorkouts = function() {

	// showing initial workout list
	console.log('preparing workouts list');

	// empty current list of exercises
	$('#workouts').empty();

	// when a single workout is clicked, load the exercises for that workout
	database.transaction(function(transaction) {
		transaction.executeSql('select workout.id,workout.name, workout.type, count(relationship.exercise_id) as count from workout left join relationship on (relationship.workout_id = workout.id) group by workout.id order by workout.name;', [],
		function (transaction, results) {
			console.log('rendering workouts');

			$.each(
				results.rows,
				function(rowIndex) {
					var row = results.rows.item(rowIndex);
					var workout_id = row.id;
					
					// render single workout
					$('#workouts').append('<li data-identifier="' + row.id + '"><a href="#ex" id="ex_item" data-identifier="' + row.id + '" title="' + row.name + '">' + row.name + '</a></li>');
					
					// adding counter to each workout item
					$('#workouts li[data-identifier=' + workout_id + ']').append('<small class="counter">' + row.count + '</small>');
							
				}
			);
		}, errorHandler);
	});

};

// refresh the exercises list
var refreshExercises = function(workout_id,workout_name) {
	
	// empty current list of exercises
	$('#exercises').empty();
  // replace the title of the workout
	$('#ex .toolbar h1').html(workout_name);
	
	$('#addExerciseButton').attr('data-identifier', workout_id);
	

	// load the exercises for that workout
	database.transaction(function(transaction) {
		transaction.executeSql('SELECT exercise.id, exercise.name, exercise.info FROM exercise WHERE exercise.id IN (SELECT exercise_id FROM relationship WHERE workout_id=' + workout_id + ');', [],
		function (transaction, results) {
			console.log('rendering exercises');

			$.each(
				results.rows,
				function(rowIndex) {
					var row = results.rows.item(rowIndex);
					$('#exercises').append('<li class="arrow"><a href="#rep" data-identifier="' + row.id + '" title="' + row.info + '">' + row.name + '</a></li>');
				}
			);
		}, errorHandler);
	});

	console.log('getting ready for workout id: ' + workout_id);

};



////////////////////////////////////
// RENDERING APP ///////////////////
////////////////////////////////////

// when the DOM is ready, init scripts
$(function(){
	
	// setting click event, so behavior is correct when viewing on iphone vs. simulator, or web page
	var userAgent = navigator.userAgent.toLowerCase();
	var isiPhone = (userAgent.indexOf('iphone') != -1 || userAgent.indexOf('ipod') != -1) ? true : false;
	clickEvent = isiPhone ? 'tap' : 'click';

////////////////////////
// INITIAL LOAD STATE //
	// when the workouts div exists in the DOM

$(window).load(function() {
	refreshWorkouts();

});
	

/////////////////////
// WORKOUT ACTIONS //
	// when workouts list slides in
	$('#home').bind('pageAnimationStart', function(event, info){
		if (info.direction == 'in'){
	 		console.log('sliding workouts in');

			refreshWorkouts();
			

			// set the info item back to the generic one
			$('.info p').empty();
			$('.info p').append('<p>Tap a workout to see exercises.</p>');
		}
	 });
	
	// when workouts list finishes sliding in
	$('#home').bind('pageAnimationEnd', function(event, info){
		if (info.direction == 'in'){
	 		console.log('slid workouts in');

			// set the info item back to the generic one
			$('.info p').empty();
			$('.info p').append('<p>Tap a workout to see exercises.</p>');
		}
	 });


	// when a single workout is clicked
	$('#workouts li a').clickEvent(function(event, info){
		// get the id of the workout that was clicked
		var workout_id	 = $(this).attr('data-identifier');
		var workout_name = $(this).attr('title');

		refreshExercises(workout_id,workout_name);

	});

	// if a particular workout item is swiped
	$('#workouts li a').swipe(function(event, data) {

		console.log('workout was swiped');

		var delete_check = confirm('Are you sure you want to delete this?');

		if (delete_check){
			// setting workout id to delete for
			var workout_id = $(this).attr('data-identifier');

			console.log('deleting workout:' + workout_id);


			database.transaction(
				function(transaction) {
					transaction.executeSql('DELETE FROM workout WHERE id=' + workout_id + ';', [], 
					function() {
						refreshWorkouts();
						jqtouch.goTo('#home', 'slideleft');
					}, errorHandler);
				}
			);
		}
	});




//////////////////////
// EXERCISE ACTIONS //

$("#nextButton").clickEvent(function(event, info){
 var cur_ex_id = $("#ex_id").val();
 
 // some jquery magic to get the next li in the exercise list
 var next_li = $("#exercises").find("li a[data-identifier=\"" + cur_ex_id + "\"]").parent().next().find("a");
 
	// get the ID of the exercise from the 'data-identifier' attribute of the exercise tapped
	var exercise_id 	= $(next_li).attr('data-identifier');

	// get the set info of the exercise from the 'title' attribute of the exercise tapped
	var exercise_info = $(next_li).attr('title');
						   
	if(exercise_id == undefined){
		
		jqtouch.goTo('#home', 'slideright');

		return false;
	}

	updateRepScreen(next_li,exercise_id,exercise_info);
 
});

	// exercise list finished sliding in
	$('#ex').bind('pageAnimationEnd', function(event, info){
		if (info.direction == 'in'){
	 		console.log('sliding exercises in');
			$('.info p').empty();
		}
	 });
	 
	 
	
	// when a single exercise is clicked
	$('#ex li a, #next_set').clickEvent(function(event, info){
		console.log('exercise was clicked');

		// get the ID of the exercise from the 'data-identifier' attribute of the exercise tapped
		var exercise_id 	= $(this).attr('data-identifier');

		// get the set info of the exercise from the 'title' attribute of the exercise tapped
		var exercise_info = $(this).attr('title');
		updateRepScreen(this,exercise_id,exercise_info);


		console.log('getting ready for exercise id: ' + exercise_id);
	});

	// if a particular exercise item is swiped
	$('#ex li a').swipe(function(event, data) {

		console.log('exercise was swiped');

		var delete_check = confirm('Are you sure you want to delete this?');

		if (delete_check){
			// setting workout id to delete for
			var exercise_id = $(this).attr('data-identifier');

			console.log('deleting exercise:' + exercise_id);


			database.transaction(
				function(transaction) {
					transaction.executeSql('DELETE FROM exercise WHERE id=' + exercise_id + ';', [], 
					function() {
						refreshExercises(exercise_id)
						jqtouch.goTo('#ex', 'slideleft');
						
					}, errorHandler);
				}
			);
		}
	});




//////////////////
// SET ACTIONS //
	// bind the form to save the exercise
	var set_form = $("#set_form");

	// setting rep inputs outside of functions, since more than one is referencing 'em			
	var weightInput	= set_form.find("input.weight")
	var repInput		= set_form.find("input.reps")

	// sliding set list in
	$('#rep').bind('pageAnimationStart', function(event, info){
		if (info.direction == 'in'){

			console.log('sliding set recorder in');

			// resetting inputs, since the user had to click back to get here
			weightInput.val("");
		 	repInput.val("");

			// setting exercise id to refresh sets for
			var exercise_id = $('#ex_id').val();
		}
	});
	
	// when set form is clicked
	 set_form.submit(function(event){
			// prevent the default submit
		event.preventDefault();

		console.log('form was submitted! attempting to save set...');

		// setting variables to be inserted
		var exercise_id = $('#ex_id').val();
		var weight = weightInput.val();
		var reps = repInput.val();

		// validation checks
		// testing if numbers were entered in weight/reps
		var numberRegex = /^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/;

	   if(weight.length > 0 && reps.length > 0 && numberRegex.test(weight) && numberRegex.test(reps)){    
			// save the exercise
			saveSet(exercise_id,weight,reps,function(){

				console.log('saving exercise id: ' + exercise_id + ' / weight: ' + weight + ' / reps: ' + reps );

				// reset the rep input only (typical for gym)
			 	repInput.val("");

				// refresh the exercise list
				getSets(refreshSets, exercise_id);

				// putting focus on rep input, since weight will probably stay the same
				repInput.focus();
			});
		} else {
			console.log('whoops, something is wrong with what the user input');
			alert("You're missing a value, or entered a non-number.")
		}
	});

	// if a particular rep item is swiped
	$('#sets li a').swipe(function(event, data) {
		console.log('rep was swiped');

		var delete_check = confirm('Are you sure you want to delete this?');

		if (delete_check){
			console.log('deleting rep' + rep_info);
			// setting exercise id to refresh sets for
			var exercise_id = $('#ex_id').val();
			var rep_info = $(this).attr('data-identifier');

			database.transaction(
				function(transaction) {
					transaction.executeSql('DELETE FROM pump WHERE id=' + rep_info + ';', [], 
					function() {
						// refresh the exercise list
						getSets(refreshSets, exercise_id);
					}, errorHandler);
				}
			);
		}
	});







//////////////////
// FORM ACTIONS //
	// if export button was clicked

	// setting em_content out here since submission uses it, too
	var em_content = "";	
	var em_date = "";

	// flipping export pane in
	$('#export').bind('pageAnimationStart', function(event, info){
		if (info.direction == 'in'){
      $('.info p').html("<p>Type an email address to send today's workout.</p>");
			console.log('flipping export pane in');

			$('#em_sets').empty();

			// setting a standard date for the set recorded
			var myDate = new Date();
			em_date = (myDate.getMonth()+1) + '/' + myDate.getDate() + '/' + myDate.getFullYear();

			console.log('displaying sets for: ' + em_date);

			database.transaction(function(transaction){
				transaction.executeSql('SELECT pump.ex_id, pump.reps, pump.weight, exercise.name FROM pump,exercise WHERE exercise.id=pump.ex_id AND pump.rep_date LIKE "%' + em_date + '%";',	[],
				function (transaction, results) {
					// showing the user the exercises that are going to be exported
					$.each(
						results.rows,
						function(rowIndex) {
							var row = results.rows.item(rowIndex);

							// setting contents of reps (used in displaying)
							rep_content = row.name + ' / ' + row.reps + ' reps of ' + row.weight + ' lbs';

							// setting contents of reps (used in emailing)
							em_content += row.name + ' / ' + row.reps + ' reps of ' + row.weight + ' lbs<br />';


							// showing the user which sets are going to be emailed
							$('#em_sets').append('<li>' + rep_content + '</li>');

						}
					);
				}, errorHandler);
			});	
		}
	});


	// bind the form to export today's exercises
	var export_form = $("#export_form");

	// if export form is submitted
	export_form.submit(function(event){

		event.preventDefault();

		console.log('form was submitted! attempting to export via email...');

		// setting email input
		var emailInput = export_form.find("input.email");

		// getting the value of the email input
		var email = emailInput.val();

		// validation checks
		// testing if email address was entered appropriately
		var emailRegex = /^([a-zA-Z0-9_\.\-\+])+\@(([a-zA-Z0-9\-])+\.)+([a-zA-Z0-9]{2,4})+$/;

		// if email validation checks out, send the email
	   if(email.length > 0 && emailRegex.test(email)){

			console.log('sending mail to: ' + email);

			// creating the email url that also contains the data
			to_email = "mailto:" + email + "?subject=" + em_date + " workout&body=" + em_content;

			// redirecting user to the email link
			window.location.href = to_email;


		} else {
			console.log('whoops, something is wrong with what the user input');
			alert("Email address isn't in the correct format.")
		}
	});

  
  
  
	// bind the form to add a workout
	var workout_form = $("#workout_form");
	
	// when add button is clicked
	$('#addWorkoutButton').clickEvent(function(){
		$('.info p').html("<p>Add a workout.</p>");
				  
		
	});
	

	// if workout form is submitted
	workout_form.submit(function(event){

		// don't prevent default, because we want it to jump back on submit
		//event.preventDefault();

		console.log('form was submitted! attempting to create the workout');

		// getting the workout input
		var workoutInput = workout_form.find("input.workout_name");

		// getting the value of the workout input
		var workout = workoutInput.val();


		if(workout.length > 0){
			// save the workout
			saveWorkout(workout,function(){

				console.log('saving workout:' + workout);

				// reset the workout input
			 	workoutInput.val("");
			
				refreshWorkouts();
			});

		} else {
			console.log('whoops, something is wrong with what the user input');
			alert("Type a workout name, please.");
		}    

	});


	// bind the form to add a workout
	var exercise_form = $("#exercise_form");

	// when add button is clicked
	$('#addExerciseButton').clickEvent(function(){
		$('.info p').html("<p>Add an exercise to the workout.</p>");
									  
		// getting workout id from button
		var workout_id = $(this).attr('data-identifier');
		
		// getting workout input
		var workoutInput = exercise_form.find("input.w_id");
		
		// setting workout_id to hidden input on form
		workoutInput.val(workout_id);
									  
		
	});

	// if workout form is submitted
	exercise_form.submit(function(event){

		event.preventDefault();

		console.log('form was submitted! attempting to create the exercise');

		// getting the workout input
		var exerciseInput = exercise_form.find("input.exercise_name");
		var exerciseInfo  = exercise_form.find("input.exercise_info");
		var workoutId			= exercise_form.find("input.w_id");

		// getting the value of the workout input
		var exercise 			= exerciseInput.val();
		var exercise_info = exerciseInfo.val();
		var workout_id		= workoutId.val();

		if(exercise.length > 0 && exercise_info.length > 0){
			// save the exercise
			saveExercise(exercise,exercise_info,workout_id,function(){

				console.log('saving exercise:' + exercise);

				// reset the workout input
			 	exerciseInput.val("");
				exerciseInfo.val("");
				workoutId.val("");
			});
		} else {
			console.log('whoops, something is wrong with what the user input');
			alert("Fill out exercise name and info, please.");
		}    
	});
}); // end jQuery function();