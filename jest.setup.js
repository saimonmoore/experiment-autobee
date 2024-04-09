// import { jest } from "@jest/globals";

global.beforeEach(() => {
  global.console = { log: ()=>{}, error: ()=>{} };
});
