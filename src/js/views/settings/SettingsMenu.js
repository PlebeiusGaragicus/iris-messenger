import Component from '../../BaseComponent';
import {translate as t} from '../../Translation';
import { route } from 'preact-router';
import State from "../../State";
import Helpers from "../../Helpers";
import {html} from "htm/preact";

const SETTINGS = {
  account: t('account'),
  key: t('private_key'),
  peer: t('peer'),
  language: t('language'),
  webtorrent: t('webtorrent'),
  webrtc: t('webRTC'),
  beta: t('beta'),
  blocked: t('blocked_users'),
};

export default class SettingsMenu extends Component{

  menuLinkClicked(url) {
    State.local.get('toggleSettingsMenu').put(false);
    State.local.get('scrollUp').put(true);
    route(`/settings/${url}`);
  }

  render() {
    const activePage = this.props.activePage || 'account';
    return (
    <>
      <div className={!this.props.activePage ? 'settings-list' : 'settings-list hidden-xs' }>
      {Helpers.isElectron ? html`<div class="electron-padding"/>` : html`
            <h3 style="padding: 0px 15px;">Settings</h3>
        `}
      {Object.keys(SETTINGS).map(page => {
          return (
            <a class={(activePage === page && window.innerWidth > 624) ? 'active' : ''} onClick={() => this.menuLinkClicked(page)} key={page}>
              <span class="text">{SETTINGS[page]}</span>
            </a>
          );
        }
      )}
      </div>
    </>  
    ); 
  }
}
