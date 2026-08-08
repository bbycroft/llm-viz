import { notFound } from 'next/navigation';
import { features, type Feature } from './features';

/** Call at the top of a page/layout. 404s when the feature is disabled. */
export function requireFeature(feature: Feature): void {
    if (!features[feature]) {
        notFound();
    }
}
