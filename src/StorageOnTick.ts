"use strict";
import type * as pl from "@akashic/playlog";

interface StorageOnTick {
	age: number;
	storageData: pl.StorageData[];
}

export default StorageOnTick;
