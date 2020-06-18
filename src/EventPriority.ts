"use strict";

const enum EventPriority {
	Lowest = 0b00,
	Unjoined = 0b01,
	Joined = 0b10,
	System = 0b11
}

export default EventPriority;
