/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import VoiceResponse from "twilio/lib/twiml/VoiceResponse";
import { interpret, createMachine, State } from 'xstate';

async function getTwiMLForState(state) {
	const twiml = new VoiceResponse();
	const gather = twiml.gather({
		numDigits: 1,
		action: '/',
		method: 'POST',
		timeout: 60
	  });
  
	switch (state) {
	  case 'main_menu':
		gather.say('Welcome to the Twilio IVR. Press 1 for Sales, 2 for Support, or 3 for Billing.');
		break;
	  case 'sales':
		twiml.say('You selected Sales. Connecting you to the Sales team.');
		// Add logic to connect to Sales team or play relevant information.
		break;
	  case 'support':
		gather.say('You selected support. Press 1 for Billing, 2 for Account Information');
		break;
	  case 'billing':
		twiml.say('You selected Billing. Connecting you to the Billing team.');
		// Add logic to connect to Billing team or play relevant information.
		break;
	  case 'accountInformation':
		twiml.say('You selected Account information. Connecting you to the account team.');
		break;
	  case 'hangup':
		// No TwiML is needed here since the call is ending.
		break;
	  default:
		twiml.say("Sorry, I don't understand that choice.");
		twiml.redirect('/voice');
		break;
	}
  
	return twiml.toString(); // Convert the VoiceResponse to TwiML XML string
  }

async function startIVR(ivr, previousState, env, CallSid) {
	console.log("start the state machince");
	let p = "";
	if (previousState !== null) {
		const jsonState = JSON.parse(previousState);
		console.log(CallSid + ": found previous state:  " +  jsonState.value )
		p = await State.create(jsonState);
	} else {
		console.log(CallSid + ": no previous state")
	}
	const service = interpret(ivr).start(p)
	.onDone(() => {
		console.log("IVR DONE");
	})
	.onTransition(async (state) => {
		// Handle state transitions here if needed
		console.log(`${CallSid}:Transitioned to states: ${state.value}`);
		const jsonState = JSON.stringify(state);
		try {
			// update or save the existing call state in the Cloudflare KV Session
			await env.SESSIONS.put(CallSid, jsonState);
		} catch (error) {
			// Handle errors if the write operation fails
			console.error('Error storing data in KV:', error);
			return new Response('Failed to store data in KV.', { status: 500 });
		}
	});
	return service;
}


const ivr = createMachine({
	id: 'ivr',
	context: {
		twiml: "",
	},
	initial: 'main_menu',
	states: {
	  main_menu: {
		entry: () => {
		  const twiml = new VoiceResponse();
		  twiml.say('Hello from your pals at Twilio! Have so much fun.');

		},
		on: {
		  '1': 'sales',
		  '2': 'support',
		},
	  },
	  sales: {
		entry: () => {
		  // Add logic to connect to Sales team or play relevant information.
		},
		on: {
		  HANGUP: 'hangup',
		},
	  },
	  support: {
		entry: () => {
		  // Add logic to connect to Support team or play relevant information.
		},
		on: {
		  '1': 'billing',
		  '2': 'accountInformation',
		  HANGUP: 'hangup',
		},
	  },
	  billing: {
		entry: () => {
		  // Add logic to connect to Sales team or play relevant information.
		},
		on: {
		  HANGUP: 'hangup',
		},
	  },
	  accountInformation: {
		entry: () => {
		  // Add logic to connect to Sales team or play relevant information.
		},
		on: {
		  HANGUP: 'hangup',
		},
	  },
	  hangup: {
		type: 'final',
	  },
	},
  });

  


  export default {
	async fetch(request, env, ctx) {
		const requestBodyText = await request.text();
		// Parse the URL-encoded string into an object
		const parsedData = new URLSearchParams(requestBodyText);

		// Convert the object into JSON format
		const jsonData = JSON.stringify(Object.fromEntries(parsedData.entries()));
		const jsonBody = JSON.parse(jsonData);
		const {Digits, CallSid} = jsonBody;
				
		console.log(CallSid + ": inbound webhook");
		// Fetch the Cloudflare KV session state referenced by the unique Twilio CallSid for each phone call
		const stateDefinition = await env.SESSIONS.get(CallSid);

		const service = await startIVR(ivr, stateDefinition, env, CallSid);
		if (Digits) {
			await service.send(Digits);
		}
		console.log(`${CallSid}:Fetch twiml for state: ${service.getSnapshot().value}`);
		const twimlResponse = await getTwiMLForState(service.getSnapshot().value);
		const response = new Response(twimlResponse, {
			headers: { 'content-type': 'text/xml' },
		});
		return response;
},
};