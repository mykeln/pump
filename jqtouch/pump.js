////////////////////////////////////////////
// INITIAL SETUP AND CONFIG ////////////////
////////////////////////////////////////////

// setting proprietary jQTouch configurations
var jqtouch = $.jQTouch({
    icon:'apple-touch-icon.png',
    addGlossToIcon: false,
		useFastTouch: true,
    startupScreen:'apple-touch-startup.png',
    statusBar:'black-translucent',
    touchSelector: '#sets li a',
    preloadImages: [
        'themes/jqt/img/back_button.png',
        'themes/jqt/img/back_button_clicked.png',
        'themes/jqt/img/button_clicked.png',
        'themes/jqt/img/grayButton.png',
        'themes/jqt/img/whiteButton.png'
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

	/*
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
	*/

	// setting data loaded to true
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

// save a new workout
var saveWorkout = function(workout,callback) {
	// needs workout passed to it so it knows what to name the workout
	
	// insert set into the database
	database.transaction(function(transaction){
		transaction.executeSql('INSERT INTO workout (name) VALUES (?);',
		[ workout ],
		function (transaction, results) {
    	callback(results.insertId);
    }, errorHandler);
	});
};

// save a new exercise
var saveExercise = function(exercise,exercise_info,callback) {
	// needs workout passed to it so it knows what to name the workout
	
	// insert set into the database
	database.transaction(function(transaction){
		transaction.executeSql('INSERT INTO exercise (name,info) VALUES (?,?);',
		[ exercise,exercise_info ],
		function (transaction, results) {
    	callback(results.insertId);
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

// refresh the workouts list
var refreshWorkouts = function() {

	// showing initial workout list
	console.log('preparing workouts list');

	// empty current list of exercises
	$('#workouts').empty();

	// when a single workout is clicked, load the exercises for that workout
	database.transaction(function(transaction) {
		transaction.executeSql('SELECT workout.id,workout.name,workout.type FROM workout ORDER BY workout.name ASC;', [],
		function (transaction, results) {
			console.log('rendering workouts');

			$.each(
				results.rows,
				function(rowIndex) {
					var row = results.rows.item(rowIndex);

					var workout_id = row.id;

					// FIXME: count the amount of exercises per workout
					transaction.executeSql('SELECT count() AS count FROM relationship WHERE workout_id=' + workout_id, [],
					function (transaction, results) {
						$.each(
							results.rows,
							function(rowIndex) {
								var row = results.rows.item(rowIndex);
								// FIXME	
								$('a[data-identifier=' + workout_id + ']').append('<small class="counter">' + row.count + '</small>');
							}
						);
					}, errorHandler);

					// render single workout
					$('#workouts').append('<li><a href="#ex" data-identifier="' + row.id + '" title="' + row.name + '">' + row.name + '</a></li>');
				}
			);
		}, errorHandler);
	});

};

// refresh the exercises list
var refreshExercises = function(workout_id,workout_name) {

	// empty the title of the workout
	$('#ex .toolbar h1').empty();

	// empty current list of exercises
	$('#exercises').empty();

	$('#ex .toolbar h1').append(workout_name);

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
	clickEvent = isiPhone ? clickEvent : 'click';
	console.log('User is: ' + userAgent + ', so I will treat all interactions as ' + clickEvent + 's');

	
  // Dynamically set next page titles after clicking certain links
  $('#home ul a, #ex ul a, #rep ul a').click(function(){
      $( $(this).attr('href') + ' h1' ).html($(this).html());
  });

	// when the workouts div exists in the DOM
	if ($('#workouts').length) {  
		refreshWorkouts();
	}


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
						// refresh the exercise list
						// need a refresh workouts callback getSets(refreshSets, exercise_id);
					}, errorHandler);
				}
			);
		}
	});


	// when a single workout is clicked
	$('#workouts li a').live(clickEvent, function(event, info){

		console.log('workout was clicked');

		// get the id of the workout that was clicked
		var workout_id	 = $(this).attr('data-identifier');
		var workout_name = $(this).attr('title');
		
		refreshExercises(workout_id,workout_name);
		
		alert(workout_id);

	});

	// when workouts list slides back in
	$('#workouts').bind('pageAnimationStart', function(event, info){
		if (info.direction == 'in'){
	 		console.log('sliding workouts in');

			// set the info item back to the generic one
			$('.info p').empty();
			$('.info p').append('<p>Tap a workout to see exercises.</p>');
		}
	 });


	// sliding exercise list in
	$('#ex').bind('pageAnimationStart', function(event, info){
		if (info.direction == 'in'){
	 		console.log('sliding exercises in');
		}
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
						// refresh the exercise list
						// need a refresh exercise callback getSets(refreshSets, exercise_id);
					}, errorHandler);
				}
			);
		}
	});


	// when a single exercise is clicked
	$('#ex li a').live(clickEvent, function(event, info){
		console.log('exercise was clicked');

		$('.info p').empty();		

		// get the ID of the exercise from the 'data-identifier' attribute of the exercise tapped
		var exercise_id 	= $(this).attr('data-identifier');

		// get the set info of the exercise from the 'title' attribute of the exercise tapped
		var exercise_info = $(this).attr('title');

		var next_set = $(this).next('li a[data-identifier]').val();
		// FIXME
		alert(next_set);

		// append a hidden input with this ID to the form, so when it's submitted we know
		// which exercise to add the set to
		$('#ex_id').val(exercise_id);


		// assign the exercise ID of the next exercise in the list to the 'next set' button
		$('#next_set').attr('href', next_set);

		$('.info p').append('<p>' + exercise_info + '</p>');
		console.log('getting ready for exercise id: ' + exercise_id);
	});



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

			// refresh the exercise list
			getSets(refreshSets, exercise_id);
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




	// when form is submitted
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



	// if export button was clicked
	$('.leftButton').live(clickEvent, function(event, info){
		console.log('export was clicked');
		$('.info p').empty();
		$('.info p').append("<p>Type an email address to send today's workout.</p>");
	});



	// setting em_content out here since submission uses it, too
	var em_content = "";	
	var em_date = "";

	// flipping export pane in
	$('#export').bind('pageAnimationStart', function(event, info){
		if (info.direction == 'in'){

			console.log('flipping export pane in');

			$('#em_sets').empty();

			// setting a standard date for the set recorded
			var myDate = new Date();
			em_date = (myDate.getMonth()+1) + '/' + myDate.getDate() + '/' + myDate.getFullYear();

			console.log('displaying sets for: ' + em_date);

			database.transaction(function(transaction){
				transaction.executeSql('SELECT pump.ex_id, pump.reps, pump.weight, exercise.name FROM pump,exercise WHERE exercise.id=pump.ex_id AND pump.rep_date LIKE "%' + em_date + '%";',	[],
				function (transaction, results) {
					// FIXME: get name of exercise
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


	// bind the form to export to trainingpeaks
	var tp_form = $("#tp_form")

	// if export form is submitted
	tp_form.submit(function(event){

		event.preventDefault();

		console.log('form was submitted! attempting to export to trainingpeaks...');

		// setting username/password input
		var usernameInput = tp_form.find("input.tp_username");
		var passwordInput = tp_form.find("input.tp_password");

		// getting the value of the username/password input
		var username = usernameInput.val();
		var password = passwordInput.val();

		// if email validation checks out, send the email
	   if(username.length > 0 && password.length > 0){
			console.log('exporting to trainingpeaks username: ' + username);

			// creating the xml file containing the workout data

			// FIXME: figure out how to send to trainingpeaks
			window.location.href = 'https://www.trainingpeaks.com/TPWebServices/EasyFileUpload.ashx?username=' + username + '&password=' + password;

			// redirecting user to the email link
			window.location.href = '#home';

		} else {
			console.log('whoops, something is wrong with what the user input');
			alert("You didn't enter a value in username, or password.")
		}

	});


	// bind the form to add a workout
	var workout_form = $("#workout_form");

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

				window.location.href = '#workouts';

			});

		} else {
			console.log('whoops, something is wrong with what the user input');
			alert("Type a workout name, please.");
		}    

	});


	// bind the form to add a workout
	var exercise_form = $("#exercise_form");

	// if workout form is submitted
	exercise_form.submit(function(event){

		event.preventDefault();

		console.log('form was submitted! attempting to create the workout');

		// getting the workout input
		var exerciseInput = exercise_form.find("input.exercise_name");
		var exerciseInfo  = exercise_form.find("input.exercise_info");


		// getting the value of the workout input
		var exercise = exerciseInput.val();
		var exercise_info = exerciseInfo.val();

		if(exercise.length > 0 && exercise_info.length > 0){
			// save the exercise
			saveExercise(exercise,exercise_info,function(){

				console.log('saving exercise:' + exercise);

				// reset the workout input
			 	exerciseInput.val("");
				exerciseInfo.val("");
			});

		} else {
			console.log('whoops, something is wrong with what the user input');
			alert("Fill out exercise name and info, please.");
		}    


	});



	}); // end jQuery function();