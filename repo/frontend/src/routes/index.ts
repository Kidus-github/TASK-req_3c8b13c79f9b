import Dashboard from './Dashboard.svelte';
import Cards from './Cards.svelte';
import Settings from './Settings.svelte';
import Import from './Import.svelte';
import Jobs from './Jobs.svelte';
import StarMap from './StarMap.svelte';
import Search from './Search.svelte';
import Voyage from './Voyage.svelte';
import Backup from './Backup.svelte';
import ParserRules from './ParserRules.svelte';
import SDKDocs from './SDKDocs.svelte';

export const routes: Record<string, typeof Dashboard> = {
  '/': Dashboard,
  '/cards': Cards,
  '/import': Import,
  '/starmap': StarMap,
  '/search': Search,
  '/voyage': Voyage,
  '/backup': Backup,
  '/parser-rules': ParserRules,
  '/sdk-docs': SDKDocs,
  '/jobs': Jobs,
  '/settings': Settings,
};
