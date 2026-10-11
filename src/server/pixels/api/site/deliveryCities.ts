import { MySqlClient } from '../../../gen_db/database';
import { MasterModel } from '../../../models/MasterModel';

export class DeliveryCities {
  private dao = new MySqlClient('pixels');
  private master = new MasterModel();
  async list(all = false) {
    const response = this.master.getResponseModel();
    try {
      const result: any = await this.dao.executeQuery(`SELECT city_id, city_name, state_name, description, is_highlighted, is_active, sort_order FROM delivery_cities ${all ? '' : 'WHERE is_active=1'} ORDER BY sort_order, city_name, city_id`, []);
      if (result.status !== 1) throw new Error(result.info || 'Unable to load delivery cities.');
      response.status = 1; response.info = 'OK'; response.data = result.rows || [];
    } catch (error: any) { response.status = -33; response.info = error.message; }
    return response;
  }
  async save(payload: any) {
    const response = this.master.getResponseModel();
    try {
      const city = String(payload.city_name || '').trim();
      const state = String(payload.state_name || '').trim();
      const description = String(payload.description || '').trim();
      const order = Number(payload.sort_order ?? 0);
      if (!city || city.length > 96 || !state || state.length > 96) throw new Error('Enter a city and state (up to 96 characters each).');
      if (description.length > 255) throw new Error('Description must be 255 characters or fewer.');
      if (!Number.isInteger(order) || order < 0 || order > 10000) throw new Error('Display order must be between 0 and 10000.');
      const flag = (value: unknown) => value === true || value === 1 || value === '1' ? 1 : 0;
      const params = [city, state, description || null, flag(payload.is_highlighted), flag(payload.is_active), order];
      const id = payload.city_id == null ? 0 : Number(payload.city_id);
      if (payload.city_id != null && (!Number.isInteger(id) || id <= 0)) throw new Error('Select a valid delivery city.');
      const result: any = id
        ? await this.dao.executeQuery('UPDATE delivery_cities SET city_name=?,state_name=?,description=?,is_highlighted=?,is_active=?,sort_order=? WHERE city_id=?', [...params, id])
        : await this.dao.executeQuery('INSERT INTO delivery_cities (city_name,state_name,description,is_highlighted,is_active,sort_order) VALUES (?,?,?,?,?,?)', params);
      if (result.status !== 1) throw new Error(/duplicate/i.test(result.info) ? 'This city and state already exist.' : result.info);
      if (id && !result.affectedRows) throw new Error('Delivery city not found.');
      response.status = 1; response.info = 'Delivery city saved.'; response.data = { city_id: id || result.insertId };
    } catch (error: any) { response.status = -33; response.info = error.message; }
    return response;
  }
  async remove(payload: any) {
    const response = this.master.getResponseModel();
    try {
      const id = Number(payload.city_id);
      if (!Number.isInteger(id) || id <= 0) throw new Error('Select a delivery city.');
      const result: any = await this.dao.executeQuery('DELETE FROM delivery_cities WHERE city_id=?', [id]);
      if (result.status !== 1 || !result.affectedRows) throw new Error('Delivery city not found.');
      response.status = 1; response.info = 'Delivery city removed.';
    } catch (error: any) { response.status = -33; response.info = error.message; }
    return response;
  }
}
