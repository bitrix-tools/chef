import BaseEvent from './base-event';
import type { EventCallback } from './base-event';

export default class EventEmitter
{
	#listeners: Map<string, Set<EventCallback>> = new Map();

	subscribe(eventName: string, listener: EventCallback): void
	{
		if (!this.#listeners.has(eventName))
		{
			this.#listeners.set(eventName, new Set());
		}

		this.#listeners.get(eventName)!.add(listener);
	}

	emit(eventName: string, event?: BaseEvent): void
	{
		const listeners = this.#listeners.get(eventName);
		if (listeners)
		{
			for (const listener of listeners)
			{
				listener(event);
			}
		}
	}
}
