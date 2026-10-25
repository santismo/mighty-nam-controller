// Page changes do not navigate the browser or reset the Bluetooth connection.
export class ControllerPages {
  constructor({views,buttons,beforeChange=async()=>true,changed=()=>{}}){
    Object.assign(this,{views,buttons,beforeChange,changed});this.current='signal';this.switching=false;this.generation=0;this.render();
  }
  reset(){this.generation++;this.current='signal';this.render();}
  render(){
    for(const [name,view] of Object.entries(this.views)){
      const active=name===this.current;
      if(typeof view.show==='function'){if(active&&!view.open)view.show();else if(!active&&view.open)view.close();}
      else view.hidden=!active;
      this.buttons[name].setAttribute('aria-pressed',String(active));
    }
  }
  async show(name){
    if(!this.views[name]||this.switching)return false;
    if(name===this.current)return true;
    this.switching=true;const generation=this.generation;
    try{
      if(await this.beforeChange(this.current,name)===false||generation!==this.generation)return false;
      this.current=name;this.render();this.changed(name);return true;
    }finally{this.switching=false;}
  }
}
