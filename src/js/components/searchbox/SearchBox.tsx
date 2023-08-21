import debounce from 'lodash/debounce';
import { createRef } from 'preact';
import { route } from 'preact-router';

import Show from '@/components/helpers/Show.tsx';
import SearchResult from '@/components/searchbox/SearchResult.tsx';
import Helpers from '@/utils/Helpers.tsx';

import Component from '../../BaseComponent.ts';
import Events from '../../nostr/Events.ts';
import FuzzySearch from '../../nostr/FuzzySearch.ts';
import Key from '../../nostr/Key.ts';
import localState from '../../state/LocalState.ts';
import { translate as t } from '../../translations/Translation.mjs';

const RESULTS_MAX = 5;

type Props = {
  onSelect?: (result: Pick<ResultItem, 'key'>) => void;
  query?: string;
  focus?: boolean;
  resultsOnly?: boolean;
  class?: string;
  tabIndex?: number;
};

type Result = {
  item: ResultItem;
};

type ResultItem = {
  key: string;
  followers: Map<string, unknown>;
  followDistance: number;
  name?: string;
  picture?: string;
  uuid?: string;
};

type State = {
  results: Array<Result>;
  query: string;
  offsetLeft: number;
  selected: number;
};

class SearchBox extends Component<Props, State> {
  inputRef = createRef();

  constructor() {
    super();
    this.state = {
      results: [],
      query: '',
      offsetLeft: 0,
      selected: -1, // -1 - 'search by keyword'
    };
  }

  onInput() {
    this.search();
  }

  onKeyUp(e) {
    // up and down buttons
    if (e.keyCode === 38 || e.keyCode === 40) {
      e.preventDefault();
      const selected = this.state.selected;
      let next = e.keyCode === 40 ? selected + 1 : selected - 1;
      next = Math.max(-1, Math.min(this.state.results.length - 1, next));
      this.setState({ selected: next });
    }
  }

  close() {
    const el = this.inputRef.current;
    el && (el.value = '');
    this.setState({ results: [], query: '' });
  }

  handleKeydown = (e) => {
    if (e.key === 'Tab' && document.activeElement?.tagName === 'BODY') {
      e.preventDefault();
      this.inputRef.current.focus();
    } else if (e.key === 'Escape') {
      this.close();
      this.inputRef.current.blur();
    }
  };

  componentDidMount() {
    localState.get('searchIndexUpdated').on(this.sub(() => this.search()));
    localState.get('activeRoute').on(
      this.sub(() => {
        this.close();
      }),
    );
    this.adjustResultsPosition();
    this.search();
    document.addEventListener('keydown', this.handleKeydown);
    this.props.focus && this.inputRef.current?.focus();
  }

  componentDidUpdate(prevProps, prevState) {
    this.adjustResultsPosition();
    if (prevProps.focus !== this.props.focus) {
      this.inputRef.current.focus();
    }
    if (prevProps.query !== this.props.query) {
      this.search();
    }
    // if first 5 results are different, set selected = 0
    if (
      this.state.selected >= 0 &&
      !Helpers.arraysAreEqual(
        this.state.results.slice(0, this.state.selected + 1),
        prevState.results.slice(0, this.state.selected + 1),
      )
    ) {
      this.setState({ selected: -1 });
    }
  }

  // remove keyup listener on unmount
  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleKeydown);
  }

  adjustResultsPosition() {
    const input = this.inputRef.current;
    if (input?.length) {
      this.setState({ offsetLeft: input[0].offsetLeft });
    }
  }

  onSubmit(e) {
    e.preventDefault();
    const el = this.inputRef.current;
    el.value = '';
    el.blur();
    // TODO go to first result
    if (this.base instanceof Element) {
      const selected = this.base.querySelector('.result.selected');
      if (selected && selected instanceof HTMLElement) {
        selected.click();
      }
    }
  }

  preventUpDownDefault(e) {
    if (e.keyCode === 38 || e.keyCode === 40) {
      e.preventDefault();
    }
  }

  searchFromServer = debounce((query) => {
    fetch(`https://eu.rbr.bio/search/${query}.json`).then((res) => {
      res.json().then((json) => {
        if (json && Array.isArray(json)) {
          json.forEach((item) => {
            Events.handle(item[1]);
          });
        }
      });
    });
  }, 500);

  search() {
    let query = this.props.query || (this.inputRef.current?.value as string) || '';
    query = query.toString().trim().toLowerCase();
    if (!query) {
      this.close();
      return;
    }
    if (query.match(/nsec1[a-zA-Z0-9]{30,65}/gi)) {
      this.inputRef.current.value = '';
      return;
    }

    if (this.props.onSelect) {
      // if matches email regex
      if (query.match(/.+@.+\..+/)) {
        Key.getPubKeyByNip05Address(query).then((pubKey) => {
          // if query hasn't changed since we started the request
          if (pubKey && query === String(this.props.query || this.inputRef.current.value)) {
            this.props.onSelect?.({ key: pubKey.toHex() });
          }
        });
      }

      if (query.startsWith('https://iris.to/')) {
        const path = query.replace('https://iris.to', '');
        route(path);
        return;
      }
      const noteMatch = query.match(/note[a-zA-Z0-9]{59,60}/gi);
      if (noteMatch) {
        route('/' + noteMatch[0]);
        return;
      }
      const npubMatch = query.match(/npub[a-zA-Z0-9]{59,60}/gi);
      if (npubMatch) {
        route('/' + npubMatch[0]);
        return;
      }
      const s = query.split('/profile/');
      if (s.length > 1) {
        return this.props.onSelect({ key: s[1] });
      }
      if (Key.toNostrHexAddress(query)) {
        return this.props.onSelect({ key: query });
      }
    }

    this.searchFromServer(query);

    if (query) {
      const results = FuzzySearch.search(query).slice(0, RESULTS_MAX);
      this.setState({ results, query });
    } else {
      this.setState({ results: [], query });
    }
  }

  onClick(e, item) {
    if (this.props.onSelect) {
      e.preventDefault();
      e.stopPropagation();
      this.props.onSelect(item);
    }
    this.close();
  }

  onResultFocus(_e, index) {
    this.setState({ selected: index });
  }

  render() {
    return (
      <div className={`relative ${this.props.class}`}>
        <Show when={!this.props.resultsOnly}>
          <form onSubmit={(e) => this.onSubmit(e)}>
            <label>
              <input
                ref={this.inputRef}
                type="text"
                onKeyPress={(e) => this.preventUpDownDefault(e)}
                onKeyDown={(e) => this.preventUpDownDefault(e)}
                onKeyUp={(e) => this.onKeyUp(e)}
                placeholder={t('search')}
                tabIndex={1}
                onInput={() => this.onInput()}
                className="input-bordered border-neutral-500 input input-sm w-full"
              />
            </label>
          </form>
        </Show>
        <div
          onKeyUp={(e) => this.onKeyUp(e)}
          className={`${
            this.state.query ? '' : 'hidden'
          } absolute z-20 left-0 mt-2 w-full bg-black border border-neutral-700 rounded shadow-lg`}
        >
          <Show when={this.state.query && !this.props.resultsOnly}>
            <a
              onFocus={(e) => this.onResultFocus(e, -1)}
              tabIndex={2}
              className={
                'p-2 cursor-pointer flex gap-2 items-center result ' +
                (-1 === this.state.selected ? 'selected bg-neutral-700' : '')
              }
              href={`/search/${encodeURIComponent(this.state.query)}`}
            >
              <div className="avatar-container">
                <div style="font-size: 1.5em; width: 40px">&#128269;</div>
              </div>
              <div>
                <span>{this.state.query}</span>
                <br />
                <small>{t('search_posts')}</small>
              </div>
            </a>
          </Show>
          {this.state.results.map((r, index) => {
            const i = r.item;
            return (
              <SearchResult
                key={i.key}
                item={i}
                selected={index === this.state.selected}
                onFocus={(e) => this.onResultFocus(e, i)}
                onClick={(e) => this.onClick(e, i)}
              />
            );
          })}
        </div>
      </div>
    );
  }
}

export default SearchBox;